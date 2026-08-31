import { describe, expect, test } from "bun:test";
import { parseJavaScriptFailure } from "./diagnostics.js";
import { javascript } from "./javascript.js";
import type { CommandOutput, FileIndex } from "./types.js";

/**
 * Every excerpt below is real output, captured by running the fixture set at its upgraded
 * versions and keeping what node actually printed. None of it is a hand-written approximation:
 * parsers written against imagined log formats pass their own tests and then fail on the first real
 * repository, because the imagined format is always tidier than the real one.
 *
 * To refresh these after a runtime or package change, bump a fixture and keep the output of
 * `node --test` verbatim.
 */
function index(files: Record<string, string>): FileIndex {
  return { has: (p) => p in files, read: (p) => files[p] ?? null };
}

function output(text: string, command = "node --test"): CommandOutput {
  return { command, exitCode: 1, stdout: text, stderr: "" };
}

const MANIFEST = index({
  "package.json": JSON.stringify({
    dependencies: { chalk: "5.6.2", "p-map": "7.0.3", "strip-ansi": "7.1.0", uuid: "11.1.0", mongoose: "7.8.7" },
  }),
});

describe("export shape changes", () => {
  test("names the package behind a bare TypeError", () => {
    const [found] = parseJavaScriptFailure(
      output("test at test\\format.test.js:7:1\n  TypeError: chalk.blue is not a function\n"),
      MANIFEST,
    );
    expect(found?.kind).toBe("not-a-function");
    expect(found?.package).toBe("chalk");
    expect(found?.symbol).toBe("chalk.blue");
    expect(found?.file).toBe("test/format.test.js");
    expect(found?.line).toBe(7);
  });

  test("maps a camelCase binding back to its kebab-case package", () => {
    const [found] = parseJavaScriptFailure(output("  TypeError: pMap is not a function\n"), MANIFEST);
    expect(found?.package).toBe("p-map");
  });

  test("leaves the package unset when the binding is local rather than a dependency", () => {
    const [found] = parseJavaScriptFailure(output("  TypeError: myHelper is not a function\n"), MANIFEST);
    expect(found?.kind).toBe("not-a-function");
    expect(found?.package).toBeUndefined();
  });
});

describe("module resolution", () => {
  test("reads the package and subpath out of a removed export", () => {
    const [found] = parseJavaScriptFailure(
      output(
        `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './v4' is not defined by "exports" in C:\\Users\\Nick\\AppData\\Local\\Temp\\cap-uuid\\node_modules\\uuid\\package.json\n`,
      ),
      MANIFEST,
    );
    expect(found?.kind).toBe("subpath-removed");
    expect(found?.package).toBe("uuid");
    expect(found?.message).toContain("'./v4'");
  });

  test("does not also report the export removal as a generic library error", () => {
    const found = parseJavaScriptFailure(
      output(
        `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './v4' is not defined by "exports" in /tmp/x/node_modules/uuid/package.json\n`,
      ),
      MANIFEST,
    );
    expect(found.map((d) => d.kind)).toEqual(["subpath-removed"]);
  });
});

describe("library-stated migrations", () => {
  test("keeps the library's own wording, which is the most reliable signal available", () => {
    const [found] = parseJavaScriptFailure(
      output("  Error [MongooseError]: Model.find() no longer accepts a callback\n"),
      MANIFEST,
    );
    expect(found?.kind).toBe("library-migration-error");
    expect(found?.message).toBe("MongooseError: Model.find() no longer accepts a callback");
  });
});

describe("promise-only migrations", () => {
  test("reads a timeout as a callback that will never fire", () => {
    const [found] = parseJavaScriptFailure(
      output("test at test\\find.test.js:6:1\n  'test timed out after 5000ms'\n"),
      MANIFEST,
    );
    expect(found?.kind).toBe("callback-never-invoked");
  });

  test("warns that the fix may change the caller's own signature", () => {
    const [found] = parseJavaScriptFailure(output("  'test timed out after 5000ms'\n"), MANIFEST);
    expect(found?.hint).toContain("human decision");
  });
});

describe("falling back honestly", () => {
  test("never returns an empty list for a failing command", () => {
    const found = parseJavaScriptFailure(output("something went wrong in a way we do not model\n"), MANIFEST);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("unknown");
  });

  test("returns nothing for a command that succeeded", () => {
    expect(parseJavaScriptFailure({ command: "npm test", exitCode: 0, stdout: "ok", stderr: "" }, MANIFEST)).toEqual([]);
  });

  test("collapses one break reported three times into one diagnostic", () => {
    const found = parseJavaScriptFailure(
      output("TypeError: chalk.blue is not a function\nTypeError: chalk.blue is not a function\n"),
      MANIFEST,
    );
    expect(found).toHaveLength(1);
  });
});

describe("the javascript plan", () => {
  test("detects the package manager from the lockfile", () => {
    const files = index({ "package.json": "{}", "pnpm-lock.yaml": "" });
    expect(javascript.plan(files)[0]?.command).toContain("pnpm install");
  });

  test("prefers a fast typecheck before the slow suite", () => {
    const files = index({
      "package.json": JSON.stringify({ scripts: { typecheck: "tsc", test: "vitest run" } }),
    });
    expect(javascript.plan(files).map((s) => s.label)).toEqual(["install", "typecheck", "test"]);
  });

  test("falls back to node --test when the repository ships no test script", () => {
    const files = index({ "package.json": "{}" });
    expect(javascript.plan(files).at(-1)?.command).toBe("node --test");
  });

  test("installs unfrozen by default, because a repair edits the manifest", () => {
    expect(javascript.plan(index({ "package.json": "{}" }))[0]?.command).not.toContain("ci");
    expect(javascript.plan(index({ "package.json": "{}" }), { frozen: true })[0]?.command).toBe("npm ci");
  });
});
