export const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');

export function getContext() {
  return globalThis[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
}
