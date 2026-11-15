import type {
  Experimental_VideoModelV4OperationStatusResult,
  JSONValue,
} from '@ai-sdk/provider';
import { withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { resolveVideoModel } from '../model/resolve-model';
import type { VideoModel } from '../types/video-model';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';

/**
 * The result of an `experimental_getVideoStatus` call: the spec-level status
 * payload, discriminated by `status` (`pending` | `completed` | `error`).
 */
export type GetVideoStatusResult =
  Experimental_VideoModelV4OperationStatusResult;

/**
 * Checks the status of an asynchronous video generation started with
 * `experimental_startVideo`.
 *
 * A single check — no polling loop. Poll by calling this on your own
 * schedule, or skip polling entirely when the start used `webhookUrl` and
 * your receiver fetches the result after the terminal notification arrives.
 *
 * @param model - The video model the operation was started on.
 * @param operation - The opaque reference returned by `experimental_startVideo`.
 * @param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
 * @param abortSignal - An optional abort signal that can be used to cancel the call.
 * @param maxRetries - Maximum number of retries for the status call. Set to 0 to disable retries. Default: 2.
 */
export async function experimental_getVideoStatus(
  modelArg: VideoModel,
  {
    operation,
    headers,
    abortSignal,
    maxRetries: maxRetriesArg,
  }: {
    operation: JSONValue;
    headers?: Record<string, string>;
    abortSignal?: AbortSignal;
    maxRetries?: number;
  },
): Promise<GetVideoStatusResult> {
  const model = resolveVideoModel(modelArg);

  if (model.doStatus == null) {
    throw new Error(
      `Video model ${model.modelId} does not implement doStatus.`,
    );
  }

  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  return retry(() =>
    model.doStatus!({
      operation,
      headers: withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
      abortSignal,
    }),
  );
}
