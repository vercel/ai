import {
  InvalidArgumentError,
  type Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  type Experimental_BatchV4Error as BatchV4Error,
  type Experimental_BatchV4ItemResult as BatchV4ItemResult,
  type Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  type Experimental_BatchV4StartOptions as BatchV4StartOptions,
  type Experimental_BatchV4StartResult as BatchV4StartResult,
  type Experimental_BatchV4Status as BatchV4Status,
  type LanguageModelV4Content,
  type LanguageModelV4GenerateResult,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertAsyncIteratorToReadableStream,
  createJsonResponseHandler,
  createNullLanguageModelUsage,
  getFromApi,
  lazySchema,
  normalizeBatchRequestCounts,
  parseProviderOptions,
  postFormDataToApi,
  postJsonToApi,
  safeValidateTypes,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { convertXaiChatUsage } from '../convert-xai-chat-usage';
import { getResponseMetadata } from '../get-response-metadata';
import { mapXaiFinishReason } from '../map-xai-finish-reason';
import {
  xaiChatResponseSchema,
  type XaiChatResponse,
} from '../xai-chat-language-model';
import { xaiFailedResponseHandler } from '../xai-error';
import { xaiFilesResponseSchema } from '../files/xai-files-api';
import {
  XaiResponsesLanguageModel,
  type XaiResponsesConfig,
} from './xai-responses-language-model';
import type { XaiResponsesModelId } from './xai-responses-language-model-options';

const xaiBatchEndpoint = '/v1/responses';
const xaiBatchName = 'ai-sdk-text-batch';
const xaiBatchResultsPageSize = 1000;

const xaiBatchProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * TTL in seconds for the uploaded batch input file, measured from
       * upload time. xAI accepts integers between 3600 (1 hour) and
       * 2592000 (30 days) inclusive. Without it the file has no expiry.
       */
      inputFileExpiresAfter: z
        .number()
        .int()
        .min(3600)
        .max(2_592_000)
        .optional(),
    }),
  ),
);

type XaiBatchRequest = Parameters<
  BatchLanguageModelV4['experimental_doStartBatch']
>[0]['requests'][number];

type XaiBatchPreparedRequest = {
  body: unknown;
  warnings: SharedV4Warning[];
};

type XaiBatchResponseConversion =
  | { success: true; result: LanguageModelV4GenerateResult }
  | { success: false; error: BatchV4Error };

const xaiBatchResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      batch_id: z.string(),
      name: z.string().nullish(),
      create_time: z.string().nullish(),
      expire_time: z.string().nullish(),
      cancel_time: z.string().nullish(),
      cancel_by_xai_message: z.string().nullish(),
      state: z
        .object({
          num_requests: z.number().nullish(),
          num_pending: z.number().nullish(),
          num_success: z.number().nullish(),
          num_error: z.number().nullish(),
          num_cancelled: z.number().nullish(),
        })
        .nullish(),
    }),
  ),
);

type XaiBatchResponse = InferSchema<typeof xaiBatchResponseSchema>;

const xaiBatchErrorSchema = z.object({
  code: z.union([z.string(), z.number()]).nullish(),
  message: z.string().nullish(),
});

const xaiBatchResultSchema = z.object({
  batch_request_id: z.string(),
  batch_result: z
    .object({
      response: z
        .object({
          chat_get_completion: z.unknown().nullish(),
        })
        .nullish(),
      error: xaiBatchErrorSchema.nullish(),
    })
    .nullish(),
  error_message: z.string().nullish(),
});

type XaiBatchResult = z.infer<typeof xaiBatchResultSchema>;

const xaiBatchResultsPageSchema = lazySchema(() =>
  zodSchema(
    z.object({
      results: z.array(xaiBatchResultSchema),
      pagination_token: z.string().nullish(),
    }),
  ),
);

class XaiResponsesBatch {
  constructor(
    private readonly options: {
      config: XaiResponsesConfig;
      prepareRequest: (
        request: XaiBatchRequest,
      ) => PromiseLike<XaiBatchPreparedRequest>;
    },
  ) {}

  async startBatch(
    options: BatchV4StartOptions<XaiBatchRequest>,
  ): Promise<BatchV4StartResult> {
    const fileParts: string[] = [];
    const warnings: BatchV4StartResult['warnings'] =
      options.webhookUrl == null
        ? []
        : [
            {
              warning: {
                type: 'unsupported',
                feature: 'webhookUrl',
                details:
                  'The xAI Batch API does not support per-batch webhook URLs.',
              },
            },
          ];

    const batchOptions = await parseProviderOptions({
      provider: 'xai',
      providerOptions: options.providerOptions,
      schema: xaiBatchProviderOptionsSchema,
    });

    for (const request of options.requests) {
      const preparedRequest = await this.options.prepareRequest(request);

      fileParts.push(
        JSON.stringify({
          custom_id: request.id,
          method: 'POST',
          url: xaiBatchEndpoint,
          body: preparedRequest.body,
        }),
        '\n',
      );

      for (const warning of preparedRequest.warnings) {
        warnings.push({ requestId: request.id, warning });
      }
    }

    const filename = 'batch.jsonl';
    const file = new Blob(fileParts, { type: 'application/jsonl' });
    fileParts.length = 0;
    const formData = new FormData();
    // xAI rejects uploads where expires_after arrives after the file part,
    // so all fields precede the file.
    if (batchOptions?.inputFileExpiresAfter != null) {
      formData.append(
        'expires_after',
        String(batchOptions.inputFileExpiresAfter),
      );
    }
    formData.append('file', file, filename);

    const headers = combineHeaders(
      this.options.config.headers?.(),
      options.headers,
    );

    const { value: uploadedFile } = await postFormDataToApi({
      url: this.getUrl('/files'),
      headers,
      formData,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiFilesResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.options.config.fetch,
    });

    const { value: batch } = await postJsonToApi({
      url: this.getUrl('/batches'),
      headers,
      body: {
        name: xaiBatchName,
        input_file_id: uploadedFile.id,
      },
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiBatchResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.options.config.fetch,
    });

    return {
      batchId: batch.batch_id,
      ...convertXaiBatchStatus(batch),
      providerMetadata: {
        xai: {
          inputFileId: uploadedFile.id,
          ...(uploadedFile.expires_at != null
            ? {
                inputFileExpiresAt: new Date(
                  uploadedFile.expires_at * 1000,
                ).toISOString(),
              }
            : {}),
        },
      },
      warnings,
    };
  }

  async getBatchStatus(
    options: BatchV4OperationOptions,
  ): Promise<BatchV4Status> {
    return convertXaiBatchStatus(await this.retrieveBatch(options));
  }

  async getBatchResults(
    options: BatchV4OperationOptions,
  ): Promise<ReadableStream<BatchV4ItemResult<LanguageModelV4GenerateResult>>> {
    const batch = await this.retrieveBatch(options);
    if (convertXaiBatchStatus(batch).status === 'pending') {
      throw new InvalidArgumentError({
        argument: 'batchId',
        message: `xAI batch "${options.batchId}" is not complete.`,
      });
    }

    return convertAsyncIteratorToReadableStream(
      this.iterateBatchResults(options),
    );
  }

  private async retrieveBatch(
    options: BatchV4OperationOptions,
  ): Promise<XaiBatchResponse> {
    const { value: batch } = await getFromApi({
      url: this.getUrl(`/batches/${encodeURIComponent(options.batchId)}`),
      headers: combineHeaders(this.options.config.headers?.(), options.headers),
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiBatchResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.options.config.fetch,
      validateUrl: false,
    });

    return batch;
  }

  private async *iterateBatchResults(
    options: BatchV4OperationOptions,
  ): AsyncGenerator<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
    let paginationToken: string | undefined;

    do {
      const query = new URLSearchParams({
        limit: String(xaiBatchResultsPageSize),
      });
      if (paginationToken != null) {
        query.set('pagination_token', paginationToken);
      }

      const { value: page } = await getFromApi({
        url: this.getUrl(
          `/batches/${encodeURIComponent(options.batchId)}/results?${query}`,
        ),
        headers: combineHeaders(
          this.options.config.headers?.(),
          options.headers,
        ),
        failedResponseHandler: xaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          xaiBatchResultsPageSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.options.config.fetch,
        validateUrl: false,
      });

      for (const result of page.results) {
        yield await this.convertBatchResult(result);
      }

      paginationToken = page.pagination_token ?? undefined;
    } while (paginationToken != null);
  }

  private async convertBatchResult(
    result: XaiBatchResult,
  ): Promise<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
    const error = result.batch_result?.error;
    if (
      (result.error_message?.length ?? 0) > 0 ||
      (error?.code != null && error.code !== 0 && error.code !== '0') ||
      (error?.code == null && (error?.message?.length ?? 0) > 0)
    ) {
      const convertedError = convertXaiBatchError(result);
      return {
        id: result.batch_request_id,
        status: isXaiCancellationError(error?.code) ? 'cancelled' : 'failed',
        error: convertedError,
      };
    }

    // xAI returns text batch results in chat completion format, including for
    // requests submitted to the Responses API endpoint.
    const response = result.batch_result?.response;
    if (response?.chat_get_completion != null) {
      const validation = await safeValidateTypes({
        value: response.chat_get_completion,
        schema: xaiChatResponseSchema,
      });
      if (!validation.success) {
        return invalidXaiBatchResult(result.batch_request_id);
      }

      const conversion = convertXaiChatBatchResponse(validation.value);
      return conversion.success
        ? {
            id: result.batch_request_id,
            status: 'succeeded',
            result: conversion.result,
          }
        : {
            id: result.batch_request_id,
            status: 'failed',
            error: conversion.error,
          };
    }

    return invalidXaiBatchResult(result.batch_request_id);
  }

  private getUrl(path: string) {
    return `${this.options.config.baseURL ?? 'https://api.x.ai/v1'}${path}`;
  }
}

export class XaiResponsesBatchLanguageModel
  extends XaiResponsesLanguageModel
  implements BatchLanguageModelV4
{
  private readonly batch: XaiResponsesBatch;

  static [WORKFLOW_SERIALIZE](model: XaiResponsesLanguageModel) {
    return XaiResponsesLanguageModel[WORKFLOW_SERIALIZE](model);
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: XaiResponsesModelId;
    config: XaiResponsesConfig;
  }) {
    return new XaiResponsesBatchLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: XaiResponsesModelId, config: XaiResponsesConfig) {
    super(modelId, config);
    this.batch = new XaiResponsesBatch({
      config,
      prepareRequest: async request => {
        const { args: body, warnings } = await this.getArgs(request.options);
        return { body, warnings };
      },
    });
  }

  experimental_doStartBatch(
    options: Parameters<BatchLanguageModelV4['experimental_doStartBatch']>[0],
  ) {
    return this.batch.startBatch(options);
  }

  experimental_doGetBatchStatus(options: BatchV4OperationOptions) {
    return this.batch.getBatchStatus(options);
  }

  experimental_doGetBatchResults(options: BatchV4OperationOptions) {
    return this.batch.getBatchResults(options);
  }
}

function convertXaiBatchStatus(batch: XaiBatchResponse): BatchV4Status {
  const requestCounts = normalizeBatchRequestCounts({
    total: batch.state?.num_requests,
    pending: batch.state?.num_pending,
    completed: batch.state?.num_success,
    failed:
      batch.state?.num_error != null && batch.state?.num_cancelled != null
        ? batch.state.num_error + batch.state.num_cancelled
        : undefined,
  });
  const isCancelled =
    batch.cancel_time != null || batch.cancel_by_xai_message != null;
  const isExpired = isPastDate(batch.expire_time);
  const status: BatchV4Status['status'] =
    isCancelled || isExpired
      ? 'failed'
      : requestCounts != null &&
          requestCounts.total > 0 &&
          requestCounts.pending === 0
        ? 'completed'
        : 'pending';

  return {
    status,
    ...(requestCounts != null ? { requestCounts } : {}),
    ...(isCancelled
      ? {
          error: {
            message:
              batch.cancel_by_xai_message ??
              `xAI batch "${batch.batch_id}" was cancelled.`,
            code: 'batch_cancelled',
          },
        }
      : isExpired
        ? {
            error: {
              message: `xAI batch "${batch.batch_id}" expired.`,
              code: 'batch_expired',
            },
          }
        : {}),
    ...(batch.create_time != null ? { createdAt: batch.create_time } : {}),
    ...(batch.expire_time != null ? { expiresAt: batch.expire_time } : {}),
  };
}

function isPastDate(value: string | null | undefined) {
  if (value == null) {
    return false;
  }
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && timestamp <= Date.now();
}

function convertXaiBatchError(result: XaiBatchResult): BatchV4Error {
  const error = result.batch_result?.error;
  return {
    message:
      result.error_message || error?.message || 'xAI batch request failed.',
    ...(error?.code != null && error.code !== 0 && error.code !== '0'
      ? { code: String(error.code) }
      : {}),
  };
}

function isXaiCancellationError(code: string | number | null | undefined) {
  const normalizedCode = String(code).toLowerCase();
  return (
    code === 1 ||
    normalizedCode === '1' ||
    normalizedCode === 'cancelled' ||
    normalizedCode === 'batch_cancelled'
  );
}

function invalidXaiBatchResult(
  id: string,
): BatchV4ItemResult<LanguageModelV4GenerateResult> {
  return {
    id,
    status: 'failed',
    error: {
      message: 'xAI returned an invalid Responses batch result.',
      code: 'invalid_response',
    },
  };
}

function convertXaiChatBatchResponse(
  response: XaiChatResponse,
): XaiBatchResponseConversion {
  if (response.error != null) {
    return {
      success: false,
      error: {
        message: response.error,
        ...(response.code != null ? { code: response.code } : {}),
      },
    };
  }

  const choices = response.choices;
  if (choices == null || choices.length === 0) {
    return {
      success: false,
      error: {
        message: 'xAI returned a batch response without any choices.',
        code: 'invalid_response',
      },
    };
  }

  const content: LanguageModelV4Content[] = [];
  const providerExecutedToolCallIds = new Set(
    choices
      .filter(choice => choice.message.role === 'tool')
      .flatMap(choice =>
        (choice.message.tool_calls ?? []).map(toolCall => toolCall.id),
      ),
  );
  let lastAssistantChoice: (typeof choices)[number] | undefined;

  for (const choice of choices) {
    if (choice.message.role === 'tool') {
      if (choice.message.content != null) {
        for (const toolCall of choice.message.tool_calls ?? []) {
          content.push({
            type: 'tool-result',
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            result: choice.message.content,
            dynamic: true,
          });
        }
      }
      continue;
    }

    lastAssistantChoice = choice;

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }
    if (choice.message.reasoning_content) {
      content.push({
        type: 'reasoning',
        text: choice.message.reasoning_content,
      });
    }
    for (const toolCall of choice.message.tool_calls ?? []) {
      content.push({
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        input: toolCall.function.arguments,
        ...(providerExecutedToolCallIds.has(toolCall.id)
          ? { providerExecuted: true, dynamic: true }
          : {}),
      });
    }
  }
  for (const url of response.citations ?? []) {
    content.push({
      type: 'source',
      sourceType: 'url',
      id: url,
      url,
    });
  }

  return {
    success: true,
    result: {
      content,
      finishReason: {
        unified: mapXaiFinishReason(lastAssistantChoice?.finish_reason),
        raw: lastAssistantChoice?.finish_reason ?? undefined,
      },
      usage: response.usage
        ? convertXaiChatUsage(response.usage)
        : createNullLanguageModelUsage(),
      response: getResponseMetadata(response),
      warnings: [],
      ...((response.usage?.cost_in_usd_ticks != null ||
        response.service_tier != null) && {
        providerMetadata: {
          xai: {
            ...(response.usage?.cost_in_usd_ticks != null
              ? { costInUsdTicks: response.usage.cost_in_usd_ticks }
              : {}),
            ...(response.service_tier != null
              ? { serviceTier: response.service_tier }
              : {}),
          },
        } satisfies SharedV4ProviderMetadata,
      }),
    },
  };
}
