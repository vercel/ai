import {
  isSameOrigin,
  validateDownloadUrl,
  type FetchFunction,
} from '@ai-sdk/provider-utils';

/**
 * Best-effort request to cancel a running prediction.
 *
 * The `cancel` URL comes from the prediction response body, so the request is
 * only sent with the configured credentials when it stays on the provider
 * origin. Credentials are withheld from any other host, and such a host is
 * validated before it is requested (see `contributing/secure-url-handling.md`).
 *
 * Cancellation never receives an abort signal and never throws: it must not
 * mask, replace, or delay the abort or timeout error that triggered it.
 */
export async function cancelReplicatePrediction({
  cancelUrl,
  headers,
  baseURL,
  fetch,
}: {
  cancelUrl: string | null | undefined;
  headers: Record<string, string | undefined>;
  baseURL: string;
  fetch?: FetchFunction;
}): Promise<void> {
  if (cancelUrl == null) {
    return;
  }

  try {
    const credentialed = isSameOrigin(cancelUrl, baseURL);

    if (!credentialed) {
      validateDownloadUrl(cancelUrl);
    }

    await (fetch ?? globalThis.fetch)(cancelUrl, {
      method: 'POST',
      headers: credentialed ? toHeaders(headers) : undefined,
    });
  } catch {
    // Best-effort only: the original abort or timeout error wins.
  }
}

function toHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => entry[1] != null,
    ),
  );
}
