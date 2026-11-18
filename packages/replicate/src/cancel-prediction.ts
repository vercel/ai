import {
  combineHeaders,
  encodePathSegment,
  postToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { replicateFailedResponseHandler } from './replicate-error';

/**
 * Best-effort request to cancel a running prediction.
 *
 * The URL is built from the configured base URL and the prediction ID, so the
 * configured credentials are only ever sent to the provider origin. No
 * prediction response data (such as `urls.cancel`) is used as a request target.
 *
 * Cancellation never receives an abort signal and never throws: it must not
 * mask, replace, or delay the abort or timeout error that triggered it.
 */
export async function cancelReplicatePrediction({
  baseURL,
  predictionId,
  headers,
  fetch,
}: {
  baseURL: string;
  predictionId: string;
  headers: Resolvable<Record<string, string | undefined> | undefined>;
  fetch?: FetchFunction;
}): Promise<void> {
  try {
    await postToApi({
      url: `${baseURL}/predictions/${encodePathSegment(predictionId)}/cancel`,
      // Fresh provider headers only: the create call's per-request headers and
      // idempotency key must not be repeated on the cancel request.
      headers: combineHeaders(await resolve(headers)),
      body: { content: '', values: undefined },
      successfulResponseHandler: async () => ({ value: undefined }),
      failedResponseHandler: replicateFailedResponseHandler,
      fetch,
    });
  } catch {
    // Best-effort only: the original abort or timeout error wins.
  }
}
