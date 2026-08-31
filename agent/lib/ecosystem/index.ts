import { javascript } from "./javascript.js";
import type { EcosystemAdapter, FileIndex } from "./types.js";

export * from "./types.js";
export { javascript } from "./javascript.js";

/**
 * Every ecosystem this template can check, in detection order.
 *
 * @remarks
 * One entry today. The contract in `types.ts` is the contribution surface: a Python, Go, or Rust
 * adapter is that interface implemented and added here, with nothing above this file changing. The
 * repair loop, the verifier, and the eval harness are all ecosystem-agnostic already.
 */
export const ADAPTERS: readonly EcosystemAdapter[] = [javascript];

/**
 * Picks the adapter for a checkout, or null when nothing recognises it.
 *
 * @remarks
 * Returning null rather than falling back to a default matters: an unrecognised repository should
 * produce an honest "this template does not know how to build your project" comment, not a
 * confident `npm install` against a Cargo workspace.
 */
export function selectAdapter(files: FileIndex): EcosystemAdapter | null {
  return ADAPTERS.find((adapter) => adapter.detect(files)) ?? null;
}
