import type { FileSet } from "./types.js";

/** Every path that differs between the two snapshots, including additions and deletions. */
export function changedPaths(before: FileSet, after: FileSet): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((p) => before.get(p) !== after.get(p)).sort();
}

export function lines(content: string | undefined): string[] {
  if (!content) return [];
  return content.split(/\r?\n/);
}

/**
 * Lines present in `after` beyond what `before` already had, compared as a multiset.
 *
 * @remarks
 * Deliberately not a real diff. Every rule here asks "did something new appear", never "where did
 * it move to", and multiset comparison answers that without a diff algorithm — so moving a line
 * does not read as adding one, which is what a positional diff would wrongly report.
 */
export function addedLines(before: string | undefined, after: string | undefined): string[] {
  const counts = new Map<string, number>();
  for (const line of lines(before)) counts.set(line, (counts.get(line) ?? 0) + 1);
  const added: string[] = [];
  for (const line of lines(after)) {
    const remaining = counts.get(line) ?? 0;
    if (remaining > 0) counts.set(line, remaining - 1);
    else added.push(line);
  }
  return added;
}

/** Matches the file-naming conventions test runners use across the ecosystems we target. */
const TEST_PATH = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.go$|(^|\/)test_[^/]+\.py$/;

export function isTestPath(path: string): boolean {
  return TEST_PATH.test(path);
}

export function isManifest(path: string): boolean {
  return path === "package.json" || path.endsWith("/package.json");
}

export function parseJson(content: string | undefined): Record<string, unknown> | null {
  if (!content) return null;
  try {
    const value: unknown = JSON.parse(content);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Trims evidence to one readable line for the pull request body. */
export function evidence(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}
