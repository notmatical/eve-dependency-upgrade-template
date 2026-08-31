import { describe, expect, test } from "bun:test";
import { type FileSet, verify, type VerifyInput } from "./index.js";

const UPGRADE = { packages: new Map([["zod", "4.4.3"]]) };

/** The upgrade bot's commit: version bumped, one call site now failing to compile. */
const BEFORE: FileSet = new Map([
  ["package.json", JSON.stringify({ name: "app", dependencies: { zod: "4.4.3" } })],
  ["src/schema.ts", "import { z } from 'zod';\nexport const S = z.string().nonempty();\n"],
  ["src/schema.test.ts", "import { S } from './schema';\nit('parses', () => { S.parse('a'); });\nit('rejects', () => { expect(() => S.parse('')).toThrow(); });\n"],
]);

function run(after: FileSet, input: Partial<VerifyInput> = {}) {
  return verify({ before: BEFORE, after, upgrade: UPGRADE, ...input });
}

const rules = (r: ReturnType<typeof run>) => r.findings.filter((f) => f.severity === "blocking").map((f) => f.rule);

describe("the honest repair", () => {
  test("passes when the call site is fixed and nothing else is touched", () => {
    const after = new Map(BEFORE);
    after.set("src/schema.ts", "import { z } from 'zod';\nexport const S = z.string().min(1);\n");
    const report = run(after);
    expect(report.ok).toBe(true);
    expect(rules(report)).toEqual([]);
  });

  test("allows a test to be adapted to a renamed API, but discloses it", () => {
    const after = new Map(BEFORE);
    after.set("src/schema.ts", "import { z } from 'zod';\nexport const S = z.string().min(1);\n");
    after.set("src/schema.test.ts", "import { S } from './schema';\nit('parses', () => { S.parse('a'); });\nit('rejects', () => { expect(() => S.safeParse('').success).toBe(false); });\n");
    const report = run(after);
    expect(report.ok).toBe(true);
    expect(report.findings.map((f) => f.rule)).toContain("test-modified");
  });
});

describe("weakening the upgrade", () => {
  test("blocks a downgrade back to the old version", () => {
    const after = new Map(BEFORE);
    after.set("package.json", JSON.stringify({ name: "app", dependencies: { zod: "3.23.8" } }));
    expect(rules(run(after))).toContain("upgrade-integrity");
  });

  test("blocks an override that reverts the upgrade behind the manifest's back", () => {
    const after = new Map(BEFORE);
    after.set("package.json", JSON.stringify({ name: "app", dependencies: { zod: "4.4.3" }, overrides: { zod: "3.23.8" } }));
    const report = run(after);
    expect(report.ok).toBe(false);
    expect(report.findings.find((f) => f.rule === "upgrade-integrity")?.message).toContain("override");
  });

  test("blocks a pnpm-flavoured override too", () => {
    const after = new Map(BEFORE);
    after.set("package.json", JSON.stringify({ name: "app", dependencies: { zod: "4.4.3" }, pnpm: { overrides: { zod: "3.23.8" } } }));
    expect(rules(run(after))).toContain("upgrade-integrity");
  });

  test("blocks dropping the dependency entirely", () => {
    const after = new Map(BEFORE);
    after.set("package.json", JSON.stringify({ name: "app", dependencies: {} }));
    expect(rules(run(after))).toContain("upgrade-integrity");
  });

  test("ignores a workspace the bot did not bump", () => {
    const before = new Map(BEFORE);
    before.set("packages/legacy/package.json", JSON.stringify({ name: "legacy", dependencies: { zod: "3.23.8" } }));
    const after = new Map(before);
    after.set("src/schema.ts", "import { z } from 'zod';\nexport const S = z.string().min(1);\n");
    expect(verify({ before, after, upgrade: UPGRADE }).ok).toBe(true);
  });
});

describe("silencing the diagnostic", () => {
  test.each([
    ["// @ts-ignore\n", "no-new-suppressions"],
    ["// @ts-expect-error upgrade\n", "no-new-suppressions"],
    ["// eslint-disable-next-line\n", "no-new-suppressions"],
    ["// biome-ignore lint: x\n", "no-new-suppressions"],
  ])("blocks %s", (comment, rule) => {
    const after = new Map(BEFORE);
    after.set("src/schema.ts", `import { z } from 'zod';\n${comment}export const S = z.string().nonempty();\n`);
    expect(rules(run(after))).toContain(rule);
  });

  test("does not fire when an existing suppression merely moves", () => {
    const before = new Map(BEFORE);
    before.set("src/legacy.ts", "// @ts-ignore\nconst a = 1;\nconst b = 2;\n");
    const after = new Map(before);
    after.set("src/legacy.ts", "const b = 2;\n// @ts-ignore\nconst a = 1;\n");
    expect(verify({ before, after, upgrade: UPGRADE }).ok).toBe(true);
  });
});

describe("removing coverage", () => {
  test("blocks deleting a test file", () => {
    const after = new Map(BEFORE);
    after.delete("src/schema.test.ts");
    expect(rules(run(after))).toContain("test-integrity");
  });

  test("blocks deleting a case from a test file", () => {
    const after = new Map(BEFORE);
    after.set("src/schema.test.ts", "import { S } from './schema';\nit('parses', () => { S.parse('a'); });\n");
    expect(rules(run(after))).toContain("test-integrity");
  });

  test("blocks skipping a case", () => {
    const after = new Map(BEFORE);
    after.set("src/schema.test.ts", "import { S } from './schema';\nit('parses', () => { S.parse('a'); });\nit.skip('rejects', () => { expect(() => S.parse('')).toThrow(); });\n");
    expect(rules(run(after))).toContain("test-integrity");
  });

  test("blocks .only, which silences every other case in the file", () => {
    const after = new Map(BEFORE);
    after.set("src/schema.test.ts", "import { S } from './schema';\nit.only('parses', () => { S.parse('a'); });\nit('rejects', () => { expect(() => S.parse('')).toThrow(); });\n");
    expect(rules(run(after))).toContain("test-integrity");
  });
});

describe("escaping the check", () => {
  test("blocks editing the workflow that decides whether the run passed", () => {
    const before = new Map(BEFORE);
    before.set(".github/workflows/ci.yml", "on: push\njobs:\n  test:\n    steps: []\n");
    const after = new Map(before);
    after.set(".github/workflows/ci.yml", "on: push\njobs: {}\n");
    expect(verify({ before, after, upgrade: UPGRADE }).findings.map((f) => f.rule)).toContain("protected-path");
  });

  test("escalates instead of opening an unreviewable diff", () => {
    const after = new Map(BEFORE);
    for (let i = 0; i < 50; i++) after.set(`src/generated/${i}.ts`, "export const x = 1;\n");
    expect(rules(run(after))).toContain("diff-budget");
  });
});

describe("disclosure", () => {
  test("reports an added package without blocking it", () => {
    const after = new Map(BEFORE);
    after.set("package.json", JSON.stringify({ name: "app", dependencies: { zod: "4.4.3", "zod-adapter": "1.0.0" } }));
    const report = run(after);
    expect(report.ok).toBe(true);
    expect(report.findings.map((f) => f.rule)).toContain("dependency-added");
  });
});
