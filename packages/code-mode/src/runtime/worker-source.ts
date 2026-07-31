/**
 * Inline worker source generated into `dist/runtime/worker-source.js` during
 * package builds.
 *
 * The source placeholder is intentionally unusable before the build step so a
 * broken package build fails loudly instead of trying to run an empty worker.
 *
 */
export const INLINE_CODE_MODE_WORKER_SOURCE =
  'throw new Error("Code mode inline worker source was not generated.");';
