// pdfjs-dist's legacy Node build tries to polyfill `DOMMatrix` from the
// optional `@napi-rs/canvas` native package, but only warns (doesn't throw)
// if that require fails -- then unconditionally runs `new DOMMatrix()` at
// its own module top level, which throws a bare ReferenceError if the
// polyfill never landed (confirmed: this is exactly what happened on
// Vercel's build, where the optional dependency didn't install, while it
// happened to be present locally). Harry only ever calls getTextContent(),
// never canvas rendering, so the real DOMMatrix math is never exercised --
// a stub that's merely constructible is enough.
//
// This must be its own module, imported before 'pdfjs-dist/legacy/build/pdf.mjs'
// as a separate static import -- not a plain statement in the same file
// placed textually above that import. ES module static imports are hoisted
// and evaluate before any of the importing module's own body code runs, so
// a same-file assignment executes too late; sibling static imports, however,
// evaluate in source order, so a separate module imported first does run
// before pdfjs-dist's own top-level code (confirmed via manual testing with
// @napi-rs/canvas temporarily removed, reproducing the exact Vercel crash
// and then confirming this ordering fixes it).
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {} as unknown as typeof DOMMatrix
}
