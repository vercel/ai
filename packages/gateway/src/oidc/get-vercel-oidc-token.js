import { getContext } from './get-context.js';
import { VercelOidcTokenError } from './token-error.js';
import { getTokenPayload, isExpired } from './token-util.js';
import { refreshToken } from './token.js';

/**
 * Gets the current OIDC token from the request context or the environment variable.
 *
 * Do not cache this value, as it is subject to change in production!
 *
 * This function is used to retrieve the OIDC token from the request context or the environment variable.
 * It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.
 *
 * Unlike the `getVercelOidcTokenSync` function, this function will refresh the token if it is expired in a development environment.
 *
 * @returns {Promise<string>} A promise that resolves to the OIDC token.
 * @throws {Error} If the `x-vercel-oidc-token` header is missing from the request context and the environment variable `VERCEL_OIDC_TOKEN` is not set. If the token
 * is expired in a development environment, will also throw an error if the token cannot be refreshed: no CLI credentials are available, CLI credentials are expired, no project configuration is available
 * or the token refresh request fails.
 *
 * @example
 *
 * ```js
 * // Using the OIDC token
 * getVercelOidcToken().then((token) => {
 *   console.log('OIDC Token:', token);
 * }).catch((error) => {
 *   console.error('Error:', error.message);
 * });
 * ```
 */
export async function getVercelOidcToken() {
  let token = '';
  let err;

  try {
    token = getVercelOidcTokenSync();
  } catch (error) {
    err = error;
  }

  try {
    if (!token || isExpired(getTokenPayload(token))) {
      await refreshToken();
      token = getVercelOidcTokenSync();
    }
  } catch (error) {
    if (err?.message && error instanceof Error) {
      error.message = `${err.message}\n${error.message}`;
    }
    throw new VercelOidcTokenError(`Failed to refresh OIDC token`, {
      cause: error,
    });
  }
  return token;
}

/**
 * Gets the current OIDC token from the request context or the environment variable.
 *
 * Do not cache this value, as it is subject to change in production!
 *
 * This function is used to retrieve the OIDC token from the request context or the environment variable.
 * It checks for the `x-vercel-oidc-token` header in the request context and falls back to the `VERCEL_OIDC_TOKEN` environment variable if the header is not present.
 *
 * This function will not refresh the token if it is expired. For refreshing the token, use the @{link getVercelOidcToken} function.
 *
 * @returns {string} The OIDC token.
 * @throws {Error} If the `x-vercel-oidc-token` header is missing from the request context and the environment variable `VERCEL_OIDC_TOKEN` is not set.
 *
 * @example
 *
 * ```js
 * // Using the OIDC token
 * const token = getVercelOidcTokenSync();
 * console.log('OIDC Token:', token);
 * ```
 */
export function getVercelOidcTokenSync() {
  const token =
    getContext().headers?.['x-vercel-oidc-token'] ??
    process.env.VERCEL_OIDC_TOKEN;

  if (!token) {
    throw new Error(
      `The 'x-vercel-oidc-token' header is missing from the request. Do you have the OIDC option enabled in the Vercel project settings?`,
    );
  }

  return token;
}
