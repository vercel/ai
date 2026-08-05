import {
  UnsupportedFunctionalityError,
  type Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  type Experimental_BatchV4ItemResult as BatchV4ItemResult,
  type LanguageModelV4,
  type LanguageModelV4GenerateResult,
} from '@ai-sdk/provider';
import { withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { logWarnings } from '../logger/log-warnings';
import { resolveLanguageModel } from '../model/resolve-model';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareLanguageModelCallOptions } from '../prompt/prepare-language-model-call-options';
import { getTotalTimeoutMs } from '../prompt/request-options';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { wrapGatewayError } from '../prompt/wrap-gateway-error';
import { asLanguageModelUsage } from '../types/usage';
import { asAsyncIterableStream } from '../util/async-iterable-stream';
import { mergeAbortSignals } from '../util/merge-abort-signals';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type {
  BatchOperationOptions,
  BatchReference,
  BatchStatus,
  StartTextBatchOptions,
  StartTextBatchResult,
  TextBatchGenerationResult,
  TextBatchItemResult,
  TextBatchRequest,
} from './batch-types';

/**
 * Starts a durable text-generation batch.
 */
export async function startTextBatch({
  model: modelArg,
  requests,
  providerOptions,
  abortSignal,
  headers,
  timeout,
}: StartTextBatchOptions): Promise<StartTextBatchResult> {
  validateRequests(requests);

  const model = resolveBatchLanguageModel(modelArg);
  const operationAbortSignal = mergeAbortSignals(
    abortSignal,
    getTotalTimeoutMs(timeout),
  );
  const supportedUrls = await model.supportedUrls;
  operationAbortSignal?.throwIfAborted();
  const normalizedRequests = [];

  for (const request of requests) {
    const standardizedPrompt = await standardizePrompt(request);

    normalizedRequests.push({
      id: request.id,
      options: {
        ...prepareLanguageModelCallOptions(request),
        prompt: await convertToLanguageModelPrompt({
          prompt: standardizedPrompt,
          supportedUrls,
          download: undefined,
          provider: model.provider.split('.')[0],
        }),
        providerOptions: request.providerOptions,
      },
    });
    operationAbortSignal?.throwIfAborted();
  }

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );
  try {
    const result = await model.experimental_doStartBatch({
      requests: normalizedRequests,
      providerOptions,
      abortSignal: operationAbortSignal,
      headers: headersWithUserAgent,
    });
    const { batchId, warnings, ...status } = result;

    logWarnings({
      warnings: warnings.map(({ warning }) => warning),
      provider: model.provider,
      model: model.modelId,
    });

    return {
      version: 1,
      type: 'text',
      id: batchId,
      provider: model.provider,
      modelId: model.modelId,
      ...status,
      warnings,
    };
  } catch (error) {
    throw wrapGatewayError(error);
  }
}

/**
 * Retrieves the latest normalized status for a durable batch.
 */
export async function getBatchStatus({
  model: modelArg,
  batch,
  providerOptions,
  maxRetries,
  abortSignal,
  headers,
  timeout,
}: BatchOperationOptions): Promise<BatchStatus> {
  const model = resolveBatchLanguageModel(modelArg);
  validateBatchReference({ model, batch });

  const operationAbortSignal = mergeAbortSignals(
    abortSignal,
    getTotalTimeoutMs(timeout),
  );
  const { retry } = prepareRetries({
    maxRetries,
    abortSignal: operationAbortSignal,
  });

  try {
    const status = await retry(() =>
      model.experimental_doGetBatchStatus({
        batchId: batch.id,
        providerOptions,
        abortSignal: operationAbortSignal,
        headers: withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
      }),
    );

    return status;
  } catch (error) {
    throw wrapGatewayError(error);
  }
}

/**
 * Streams complete terminal results for the requests in a durable batch.
 */
export function getBatchResults({
  model: modelArg,
  batch,
  providerOptions,
  maxRetries,
  abortSignal,
  headers,
  timeout,
}: BatchOperationOptions) {
  const model = resolveBatchLanguageModel(modelArg);
  validateBatchReference({ model, batch });

  const streamAbortController = new AbortController();
  const operationAbortSignal = mergeAbortSignals(
    abortSignal,
    getTotalTimeoutMs(timeout),
    streamAbortController.signal,
  );
  const { retry } = prepareRetries({
    maxRetries,
    abortSignal: operationAbortSignal,
  });
  const transformer: Transformer<
    BatchV4ItemResult<LanguageModelV4GenerateResult>,
    TextBatchItemResult
  > & { cancel?: (reason?: unknown) => void } = {
    transform(item, controller) {
      controller.enqueue(convertBatchItemResult(item));
    },

    cancel(reason) {
      streamAbortController.abort(
        reason ?? new Error('Batch results stream was cancelled.'),
      );
    },
  };
  const transform = new TransformStream<
    BatchV4ItemResult<LanguageModelV4GenerateResult>,
    TextBatchItemResult
  >(transformer);

  void (async () => {
    try {
      const stream = await retry(() =>
        model.experimental_doGetBatchResults({
          batchId: batch.id,
          providerOptions,
          abortSignal: operationAbortSignal,
          headers: withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`),
        }),
      );

      await stream.pipeTo(transform.writable, {
        signal: operationAbortSignal,
      });
    } catch (error) {
      await transform.writable.abort(wrapGatewayError(error)).catch(() => {});
    }
  })();

  return asAsyncIterableStream(transform.readable);
}

function resolveBatchLanguageModel(
  modelArg: StartTextBatchOptions['model'],
): BatchLanguageModelV4 {
  const model = resolveLanguageModel(modelArg);

  if (!isBatchLanguageModel(model)) {
    throw new UnsupportedFunctionalityError({
      functionality: 'batch processing',
      message: `The ${model.provider} model "${model.modelId}" does not support batch processing.`,
    });
  }

  return model;
}

function isBatchLanguageModel(
  model: LanguageModelV4,
): model is BatchLanguageModelV4 {
  const candidate = model as Partial<BatchLanguageModelV4>;
  return (
    typeof candidate.experimental_doStartBatch === 'function' &&
    typeof candidate.experimental_doGetBatchStatus === 'function' &&
    typeof candidate.experimental_doGetBatchResults === 'function'
  );
}

function validateRequests(requests: ReadonlyArray<TextBatchRequest>) {
  if (requests.length === 0) {
    throw new InvalidArgumentError({
      parameter: 'requests',
      value: requests,
      message: 'requests must not be empty',
    });
  }

  const ids = new Set<string>();

  for (const request of requests) {
    if (request.id.trim().length === 0) {
      throw new InvalidArgumentError({
        parameter: 'requests',
        value: requests,
        message: 'request IDs must not be empty',
      });
    }

    if (ids.has(request.id)) {
      throw new InvalidArgumentError({
        parameter: 'requests',
        value: requests,
        message: `request IDs must be unique; duplicate ID "${request.id}"`,
      });
    }

    ids.add(request.id);
  }
}

function validateBatchReference({
  model,
  batch,
}: {
  model: BatchLanguageModelV4;
  batch: BatchReference;
}) {
  if (batch.version !== 1 || batch.type !== 'text') {
    throw new InvalidArgumentError({
      parameter: 'batch',
      value: batch,
      message: 'batch must be a supported text batch reference',
    });
  }

  if (batch.provider !== model.provider || batch.modelId !== model.modelId) {
    throw new InvalidArgumentError({
      parameter: 'model',
      value: model,
      message:
        `model ${model.provider}:${model.modelId} is not compatible with ` +
        `batch ${batch.provider}:${batch.modelId}`,
    });
  }
}

function convertBatchItemResult(
  item: BatchV4ItemResult<LanguageModelV4GenerateResult>,
): TextBatchItemResult {
  if (item.status !== 'succeeded') {
    return item;
  }

  return {
    id: item.id,
    status: 'succeeded',
    ...convertGenerateResult(item.result),
  };
}

function convertGenerateResult(
  result: LanguageModelV4GenerateResult,
): TextBatchGenerationResult {
  return {
    text: result.content
      .filter(
        (part): part is Extract<typeof part, { type: 'text' }> =>
          part.type === 'text',
      )
      .map(part => part.text)
      .join(''),
    finishReason: result.finishReason.unified,
    rawFinishReason: result.finishReason.raw,
    usage: asLanguageModelUsage(result.usage),
    ...(result.response != null
      ? {
          response: {
            id: result.response.id,
            timestamp: result.response.timestamp?.toISOString(),
            modelId: result.response.modelId,
          },
        }
      : {}),
    providerMetadata: result.providerMetadata,
  };
}
