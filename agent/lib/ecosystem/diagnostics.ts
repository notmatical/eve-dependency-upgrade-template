import type { CommandOutput, Diagnostic, FileIndex } from "./types.js";

/** `pMap` becomes `p-map`, `stripAnsi` becomes `strip-ansi`: how the ecosystem names a binding. */
function kebab(identifier: string): string {
  return identifier.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Resolves the binding that failed back to a declared dependency.
 *
 * @remarks
 * Matching against the manifest rather than accepting any identifier is what keeps this honest. A
 * `TypeError` on a local helper is not evidence about the upgrade, and naming a package that is not
 * in the manifest would send the agent off to read a changelog with no bearing on the failure.
 */
function dependencyFor(identifier: string, files: FileIndex): string | undefined {
  const manifest = files.read("package.json");
  if (!manifest) return undefined;
  let declared: string[];
  try {
    const parsed = JSON.parse(manifest) as Record<string, Record<string, string> | undefined>;
    declared = [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ];
  } catch {
    return undefined;
  }
  const root = identifier.split(".")[0] ?? identifier;
  const candidates = [root, kebab(root)];
  return declared.find(
    (name) => candidates.includes(name) || candidates.includes(name.replace(/^@[^/]+\//, "")),
  );
}

const HINTS: Partial<Record<Diagnostic["kind"], string>> = {
  "subpath-removed":
    "The package stopped publishing this subpath and almost certainly moved it to a named export on the main entry. Find the replacement in the changelog rather than reaching for a deep path into node_modules.",
  "esm-only-import":
    "The package is now ESM-only. Converting the consumer to ESM is the real fix; a dynamic import is the fallback, and it makes the consuming function asynchronous.",
  "not-a-function":
    "The export shape changed: either a default export that used to survive `require` no longer does, or a symbol was renamed. The changelog says which. An interop shim that papers over it will pass the tests and still be wrong.",
  "library-migration-error":
    "The library is stating what it removed. Take it literally and follow its migration guide; this is the most reliable signal available.",
  "callback-never-invoked":
    "The API became promise-only, so the callback is never called and the caller hangs. Awaiting it may force the enclosing function to become asynchronous. If that function's signature is part of this package's own published contract, the upgrade needs a human decision rather than a local fix.",
  "module-not-found":
    "Either the package was renamed or an entry point disappeared. Confirm which before adding anything to the manifest.",
};

function withHint(diagnostic: Omit<Diagnostic, "hint">): Diagnostic {
  const hint = HINTS[diagnostic.kind];
  return hint ? { ...diagnostic, hint } : diagnostic;
}

const LOCATION = /test at ([^\s:]+\.[cm]?[jt]sx?):(\d+)/;
const SUBPATH =
  /Package subpath '([^']+)' is not defined by "exports" in .*node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]package\.json/;
const ESM_PACKAGE = /Must use import to load ES Module: .*node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;
const NOT_A_FUNCTION = /(?:TypeError|Error): ([\w$.]+) is not a function/g;
const NAMED_ERROR = /Error \[(\w*Error)\]: ([^\n]+)/g;
const TIMED_OUT = /'test timed out after (\d+)ms'/;
const MISSING_MODULE = /Cannot find module '([^']+)'/;
const TS_ERROR = /error (TS\d+): ([^\n]+)/g;
const ASSERTION_DETAIL = /AssertionError[^\n]*:\s*([^\n]+)/;

function posix(value: string | undefined): string | undefined {
  return value?.replaceAll("\\", "/");
}

/** The runner's own location line, normalised away from Windows separators. */
function locationOf(text: string): { file?: string; line?: number } {
  const match = LOCATION.exec(text);
  const file = match?.[1];
  const line = match?.[2];
  if (!file || !line) return {};
  return { file: file.replaceAll("\\", "/"), line: Number(line) };
}

/**
 * Turns one command's output into the failures worth acting on.
 *
 * @remarks
 * Ordered most specific first and deduplicated at the end, because a single break surfaces several
 * ways in one run: node prints the module error, the runner prints a test failure for the same
 * file, and the summary prints it a third time. Three diagnostics for one cause would read to the
 * model as three separate problems and invite three separate repairs.
 */
export function parseJavaScriptFailure(output: CommandOutput, files: FileIndex): Diagnostic[] {
  const text = `${output.stdout}\n${output.stderr}`;
  const where = locationOf(text);
  const found: Diagnostic[] = [];

  const subpath = SUBPATH.exec(text);
  if (subpath?.[2]) {
    const name = posix(subpath[2]) as string;
    found.push(
      withHint({
        kind: "subpath-removed",
        message: `Subpath '${subpath[1]}' is no longer exported by ${name}.`,
        package: name,
        ...where,
      }),
    );
  }

  if (text.includes("ERR_REQUIRE_ESM")) {
    const name = posix(ESM_PACKAGE.exec(text)?.[1]);
    found.push(
      withHint({
        kind: "esm-only-import",
        message: `${name ?? "A dependency"} is ESM-only and cannot be require()d.`,
        ...(name ? { package: name } : {}),
        ...where,
      }),
    );
  }

  for (const match of text.matchAll(NOT_A_FUNCTION)) {
    const symbol = match[1];
    if (!symbol) continue;
    const name = dependencyFor(symbol, files);
    found.push(
      withHint({
        kind: "not-a-function",
        message: `${symbol} is not a function.`,
        symbol,
        ...(name ? { package: name } : {}),
        ...where,
      }),
    );
  }

  for (const match of text.matchAll(NAMED_ERROR)) {
    if (match[1] === "ERR_PACKAGE_PATH_NOT_EXPORTED") continue;
    found.push(
      withHint({
        kind: "library-migration-error",
        message: `${match[1]}: ${match[2]?.trim() ?? ""}`,
        ...where,
      }),
    );
  }

  const timeout = TIMED_OUT.exec(text);
  if (timeout) {
    found.push(
      withHint({
        kind: "callback-never-invoked",
        message: `A test timed out after ${timeout[1]}ms without completing.`,
        ...where,
      }),
    );
  }

  const missing = MISSING_MODULE.exec(text);
  if (missing) {
    found.push(
      withHint({ kind: "module-not-found", message: `Cannot find module '${missing[1]}'.`, ...where }),
    );
  }

  for (const match of text.matchAll(TS_ERROR)) {
    found.push(withHint({ kind: "type-error", message: `${match[1]}: ${match[2]?.trim() ?? ""}` }));
  }

  if (found.length === 0 && text.includes("ERR_ASSERTION")) {
    found.push({
      kind: "assertion-failed",
      message: ASSERTION_DETAIL.exec(text)?.[1]?.trim() ?? "An assertion failed with no recognised upgrade signature.",
      ...where,
    });
  }

  if (found.length === 0 && output.exitCode !== 0) {
    found.push({
      kind: "unknown",
      message: `\`${output.command}\` exited ${output.exitCode} with no recognised failure signature.`,
    });
  }

  const seen = new Set<string>();
  return found.filter((diagnostic) => {
    const key = `${diagnostic.kind}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
