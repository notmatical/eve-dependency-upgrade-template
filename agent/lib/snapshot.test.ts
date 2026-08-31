import { describe, expect, test } from "bun:test";
import { botRef, mergeIntents, parseChangedPaths, upgradeIntentFrom } from "./snapshot.js";

const manifest = (deps: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ name: "app", dependencies: deps, devDependencies: dev });

describe("reading what the bot asked for", () => {
  test("reports only the dependency that changed", () => {
    const intent = upgradeIntentFrom(
      manifest({ zod: "3.23.8", express: "4.21.2" }),
      manifest({ zod: "4.4.3", express: "4.21.2" }),
    );
    expect([...intent.packages]).toEqual([["zod", "4.4.3"]]);
  });

  test("sees a bump in devDependencies too", () => {
    const intent = upgradeIntentFrom(manifest({}, { vitest: "1.6.0" }), manifest({}, { vitest: "3.2.4" }));
    expect(intent.packages.get("vitest")).toBe("3.2.4");
  });

  test("treats a newly added dependency as part of the intent", () => {
    const intent = upgradeIntentFrom(manifest({}), manifest({ zod: "4.4.3" }));
    expect(intent.packages.get("zod")).toBe("4.4.3");
  });

  test("returns nothing when the manifests match", () => {
    expect(upgradeIntentFrom(manifest({ zod: "4.4.3" }), manifest({ zod: "4.4.3" })).packages.size).toBe(0);
  });

  test("survives an unparseable manifest without inventing an intent", () => {
    expect(upgradeIntentFrom("{ not json", manifest({ zod: "4.4.3" })).packages.size).toBe(1);
    expect(upgradeIntentFrom(manifest({ zod: "3.0.0" }), "{ not json").packages.size).toBe(0);
  });

  test("merges a monorepo bump that spans workspaces", () => {
    const merged = mergeIntents([
      upgradeIntentFrom(manifest({ zod: "3.23.8" }), manifest({ zod: "4.4.3" })),
      upgradeIntentFrom(manifest({ glob: "8.1.0" }), manifest({ glob: "9.3.5" })),
    ]);
    expect([...merged.packages].sort()).toEqual([
      ["glob", "9.3.5"],
      ["zod", "4.4.3"],
    ]);
  });
});

describe("the baseline is the remote", () => {
  test("compares against the pushed branch, which the sandbox cannot write", () => {
    expect(botRef("renovate/zod-4.x")).toBe("origin/renovate/zod-4.x");
  });
});

describe("parsing git output", () => {
  test("drops blank lines and whitespace", () => {
    expect(parseChangedPaths("src/a.ts\n\n  src/b.ts  \n")).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("returns nothing for an empty diff", () => {
    expect(parseChangedPaths("\n")).toEqual([]);
  });
});
