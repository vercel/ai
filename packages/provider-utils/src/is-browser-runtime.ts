/**
 * Returns true when running in a DOM browser environment.
 *
 * Used to decide whether redirects can be followed manually: in browsers,
 * `fetch(url, { redirect: 'manual' })` returns an unreadable opaque-redirect
 * response, so hops cannot be validated individually. SSRF is a server-side
 * threat (browser fetch is constrained by CORS and cannot reach a server's
 * internal network or cloud-metadata endpoints), so the manual handling only
 * applies off the browser.
 *
 * Matches the browser signal used by `getRuntimeEnvironmentUserAgent`: workers
 * and edge/Deno/Bun/Node runtimes (where `redirect: 'manual'` is readable) do
 * not define `window`.
 */
export function isBrowserRuntime(
  globalThisAny: any = globalThis as any,
): boolean {
  return typeof globalThisAny.window !== 'undefined';
}
