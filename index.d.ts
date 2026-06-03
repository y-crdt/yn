// Type declarations for @y-crdt/yn — nodejs bindings to yrs.
//
// The runtime entry points (index.mjs / load.cjs) expose the native addon's
// bindings both as named exports and as a default export (the binding object).

/**
 * Merge a set of Yjs/yrs document updates into a single update.
 *
 * Decodes each `v1`-encoded update, applies them to a fresh document, and
 * returns the resulting document state encoded as a single `v1` update.
 *
 * @param gc - When `true`, garbage-collect deleted content while merging.
 *             When `false`, deleted content is retained (`skip_gc`).
 * @param updates - The `v1`-encoded updates to merge, each as a `Uint8Array`.
 * @returns The merged document state encoded as a `v1` update.
 * @throws If any update fails to decode or apply.
 */
export function applyUpdates(gc: boolean, updates: Uint8Array[]): Uint8Array;

/** The native addon's binding object, exposing the same members as the named exports. */
interface YNBinding {
  applyUpdates: typeof applyUpdates;
}

declare const binding: YNBinding;

export default binding;
