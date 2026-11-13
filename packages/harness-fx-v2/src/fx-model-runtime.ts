import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';
import { VERSION } from './version';

/**
 * Value sent in the `User-Agent` and `x-client-app` headers of AI Gateway
 * requests.
 */
export const FX_CLIENT_APP = `ai-sdk-harness-fx-v2/${VERSION}`;

/**
 * Model used for a turn whose settings do not request one: libfx 0.0.16's
 * built-in default model.
 *
 * It is passed to libfx explicitly instead of leaving the model unset, so
 * every turn's model is chosen by the adapter and a replayed turn uses the
 * same model however libfx resolves an unset one. Keep it in sync with
 * libfx's default when updating libfx.
 */
export const DEFAULT_FX_MODEL_ID = 'spacexai/grok-4.7';

/**
 * Origin libfx sends AI Gateway requests to.
 */
export const FX_GATEWAY_ORIGIN = 'https://ai-gateway.vercel.sh';

/**
 * Network access of one drive: the AI Gateway credential libfx sends with
 * its requests, and the `fetch` that performs them.
 */
export type FxModelRuntime = {
  /**
   * AI Gateway credential.
   */
  apiKey: string;

  /**
   * Performs a request libfx made, e.g. a model request.
   */
  // oxlint-disable-next-line ai-sdk/require-object-parameter -- `fetch` signature.
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
};

/**
 * Creates the network access of one drive.
 *
 * The AI Gateway credential (`AI_GATEWAY_API_KEY`, else `VERCEL_OIDC_TOKEN`)
 * is read from the environment once per drive, so a refreshed OIDC token is
 * picked up by the next drive. Throws when no credential is available, before
 * the drive does any work. Requests to AI Gateway's origin are sent to
 * `AI_GATEWAY_BASE_URL` instead when it is set, and every request carries
 * the adapter's client headers.
 */
export function createFxModelRuntime(): FxModelRuntime {
  /*
   * TODO: Only AI Gateway authentication is supported so far. Support other
   * providers once the harness offers a way to configure them.
   */
  const { apiKey, baseUrl } = getAiGatewayAuthFromEnv({ env: process.env });
  if (apiKey == null) {
    throw new Error(
      'fx harness: no AI Gateway credential found. Set AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.',
    );
  }
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  return {
    apiKey,
    // oxlint-disable-next-line ai-sdk/require-object-parameter -- `fetch` signature.
    fetch(input, init) {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const target =
        url.origin === FX_GATEWAY_ORIGIN
          ? new URL(url.pathname.slice(1) + url.search, base)
          : url;
      const headers = new Headers(request.headers);
      headers.set('User-Agent', FX_CLIENT_APP);
      headers.set('x-client-app', FX_CLIENT_APP);
      return globalThis.fetch(target, {
        ...init,
        method: request.method,
        headers,
      });
    },
  };
}
