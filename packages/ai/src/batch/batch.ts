import {
  UnsupportedFunctionalityError,
  type Experimental_BatchV4 as BatchV4,
  type Experimental_BatchV4ItemResult as BatchV4ItemResult,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4ToolCall,
} from '@ai-sdk/provider';
import { gateway } from '@ai-sdk/gateway';
import { type ToolSet, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { convertLanguageModelContent } from '../generate-text/convert-language-model-content';
import { parseToolCall } from '../generate-text/parse-tool-call';
import { prepareToolChoice } from '../prompt/prepare-tool-choice';
import { prepareTools } from '../prompt/prepare-tools';
import { logWarnings } from '../logger/log-warnings';
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
import { asProviderV4 } from '../model/as-provider-v4';
import type {
  BatchOperationOptions,
  BatchProvider,
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
export async function startTextBatch<
  TOOLS extends ToolSet,
  PROVIDER extends BatchProvider,
>({
  provider,
  model,
  requests,
  tools,
  toolChoice,
  toolOrder,
  toolsContext,
  providerOptions,
  webhookUrl,
  abortSignal,
  headers,
  timeout,
}: StartTextBatchOptions<TOOLS, PROVIDER>): Promise<StartTextBatchResult> {
  validateRequests(requests);

  const batchApi = resolveBatchApi(provider);
  const operationAbortSignal = mergeAbortSignals(
    abortSignal,
    getTotalTimeoutMs(timeout),
  );
  const supportedUrls = await batchApi.supportedUrls;
  const preparedTools = await prepareTools({
    tools,
    toolOrder,
    toolsContext,
  });
  const preparedToolChoice = prepareToolChoice({ toolChoice });
  operationAbortSignal?.throwIfAborted();
  const normalizedRequests = [];

  for (const request of requests) {
    const standardizedPrompt = await standardizePrompt(request);

    normalizedRequests.push({
      id: request.id,
      modelId: request.model ?? model,
      options: {
        ...prepareLanguageModelCallOptions(request),
        prompt: await convertToLanguageModelPrompt({
          prompt: standardizedPrompt,
          supportedUrls,
          download: undefined,
          provider: batchApi.provider.split('.')[0],
        }),
        tools: preparedTools,
        toolChoice: preparedToolChoice,
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
    const result = await batchApi.experimental_doStartBatch({
      type: 'text',
      requests: normalizedRequests,
      providerOptions,
      abortSignal: operationAbortSignal,
      headers: headersWithUserAgent,
      ...(webhookUrl != null && { webhookUrl }),
    });
    const { batchId, warnings, ...status } = result;

    logWarnings({
      warnings: warnings.map(({ warning }) => warning),
      provider: batchApi.provider,
      model,
    });

    return {
      version: 1,
      type: 'text',
      id: batchId,
      provider: batchApi.provider,
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
  provider,
  batch,
  providerOptions,
  maxRetries,
  abortSignal,
  headers,
  timeout,
}: Omit<BatchOperationOptions, 'tools'>): Promise<BatchStatus> {
  const batchApi = resolveBatchApi(provider);
  validateBatchReference({ batchApi, batch });

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
      batchApi.experimental_doGetBatchStatus({
        type: batch.type,
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
export function getBatchResults<TOOLS extends ToolSet>({
  provider,
  batch,
  tools,
  providerOptions,
  maxRetries,
  abortSignal,
  headers,
  timeout,
}: BatchOperationOptions<TOOLS>) {
  const batchApi = resolveBatchApi(provider);
  validateBatchReference({ batchApi, batch });

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
    BatchV4ItemResult,
    TextBatchItemResult<TOOLS>
  > & { cancel?: (reason?: unknown) => void } = {
    async transform(item, controller) {
      controller.enqueue(await convertBatchItemResult({ item, tools }));
    },

    cancel(reason) {
      streamAbortController.abort(
        reason ?? new Error('Batch results stream was cancelled.'),
      );
    },
  };
  const transform = new TransformStream<
    BatchV4ItemResult,
    TextBatchItemResult<TOOLS>
  >(transformer);

  void (async () => {
    try {
      const stream = await retry(() =>
        batchApi.experimental_doGetBatchResults({
          type: batch.type,
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

function resolveBatchApi(provider?: BatchProvider): BatchV4 {
  provider ??= asProviderV4(globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway);

  if (isBatchApi(provider)) {
    return provider;
  }

  if (typeof provider.batch !== 'function') {
    throw new UnsupportedFunctionalityError({
      functionality: 'batch processing',
      message:
        'The provider does not support batch processing. Make sure it exposes a batch() method.',
    });
  }

  return provider.batch();
}

function isBatchApi(provider: BatchProvider): provider is BatchV4 {
  const candidate = provider as Partial<BatchV4>;
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
  batchApi,
  batch,
}: {
  batchApi: BatchV4;
  batch: BatchReference;
}) {
  if (batch.version !== 1 || batch.type !== 'text') {
    throw new InvalidArgumentError({
      parameter: 'batch',
      value: batch,
      message: 'batch must be a supported text batch reference',
    });
  }

  if (batch.provider !== batchApi.provider) {
    throw new InvalidArgumentError({
      parameter: 'provider',
      value: batchApi,
      message:
        `provider ${batchApi.provider} is not compatible with ` +
        `batch provider ${batch.provider}`,
    });
  }
}

async function convertBatchItemResult<TOOLS extends ToolSet>({
  item,
  tools,
}: {
  item: BatchV4ItemResult;
  tools: TOOLS | undefined;
}): Promise<TextBatchItemResult<TOOLS>> {
  switch (item.type) {
    case 'text':
      switch (item.status) {
        case 'succeeded':
          return {
            id: item.id,
            status: item.status,
            ...(await convertGenerateResult({ result: item.result, tools })),
          };
        case 'failed':
          return {
            id: item.id,
            status: item.status,
            error: item.error,
            providerMetadata: item.providerMetadata,
          };
        case 'cancelled':
        case 'expired':
          return {
            id: item.id,
            status: item.status,
            error: item.error,
            providerMetadata: item.providerMetadata,
          };
      }
  }
}

async function convertGenerateResult<TOOLS extends ToolSet>({
  result,
  tools,
}: {
  result: LanguageModelV4GenerateResult;
  tools: TOOLS | undefined;
}): Promise<TextBatchGenerationResult<TOOLS>> {
  const toolCalls = await Promise.all(
    result.content
      .filter(
        (part): part is LanguageModelV4ToolCall => part.type === 'tool-call',
      )
      .map(toolCall =>
        parseToolCall<TOOLS>({
          toolCall,
          tools,
          repairToolCall: undefined,
          refineToolInput: undefined,
          instructions: undefined,
          messages: [],
        }),
      ),
  );
  const content = convertLanguageModelContent<TOOLS>({
    content: result.content,
    toolCalls,
    toolOutputs: [],
    toolApprovalRequests: [],
    toolApprovalResponses: [],
    tools,
  });

  return {
    content,
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
