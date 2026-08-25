import {
  InvalidArgumentError,
  InvalidResponseDataError,
  type Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  type Experimental_BatchV4StartOptions as BatchV4StartOptions,
  type Experimental_BatchV4StartResult as BatchV4StartResult,
  type Experimental_BatchV4Error as BatchV4Error,
  type Experimental_BatchV4ItemResult as BatchV4ItemResult,
  type Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  type Experimental_BatchV4Status as BatchV4Status,
  type LanguageModelV4GenerateResult,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertAsyncIteratorToReadableStream,
  createJsonLinesResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  lazySchema,
  normalizeBatchRequestCounts,
  postJsonToApi,
  postToApi,
  safeValidateTypes,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  openaiErrorDataSchema,
  openaiFailedResponseHandler,
} from './openai-error';
import type { OpenAIConfig } from './openai-config';
import { openaiFilesResponseSchema } from './files/openai-files-api';
import { convertOpenAIResponsesUsage } from './responses/convert-openai-responses-usage';
import { mapOpenAIResponseFinishReason } from './responses/map-openai-responses-finish-reason';
import {
  openaiResponsesResponseSchema,
  type OpenAIResponsesLogprobs,
} from './responses/openai-responses-api';
import { OpenAIResponsesLanguageModel } from './responses/openai-responses-language-model';
import type { OpenAIResponsesModelId } from './responses/openai-responses-language-model-options';
import type { ResponsesReasoningProviderMetadata } from './responses/openai-responses-provider-metadata';

const openaiBatchEndpoint = '/v1/responses';
const openaiBatchInputFileExpiresAfterSeconds = 48 * 60 * 60;

type OpenAIBatchRequest = Parameters<
  BatchLanguageModelV4['experimental_doStartBatch']
>[0]['requests'][number];

type OpenAIBatchPreparedRequest = {
  body: unknown;
  warnings: SharedV4Warning[];
};

type OpenAIBatchResponseConversion =
  | { success: true; result: LanguageModelV4GenerateResult }
  | { success: false; error: BatchV4Error };

const openaiBatchResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      status: z.string(),
      output_file_id: z.string().nullish(),
      error_file_id: z.string().nullish(),
      created_at: z.number().nullish(),
      expires_at: z.number().nullish(),
      request_counts: z
        .object({
          total: z.number().nullish(),
          completed: z.number().nullish(),
          failed: z.number().nullish(),
        })
        .nullish(),
      errors: z
        .object({
          data: z
            .array(
              z.object({
                code: z.string().nullish(),
                message: z.string().nullish(),
              }),
            )
            .nullish(),
        })
        .nullish(),
    }),
  ),
);

type OpenAIBatchResponse = InferSchema<typeof openaiBatchResponseSchema>;

const openaiBatchResultLineSchema = lazySchema(() =>
  zodSchema(
    z.object({
      custom_id: z.string(),
      response: z
        .object({
          status_code: z.number(),
          request_id: z.string().nullish(),
          body: z.unknown(),
        })
        .nullish(),
      error: z
        .object({
          code: z.string(),
          message: z.string(),
        })
        .nullish(),
    }),
  ),
);

type OpenAIBatchResultLine = InferSchema<typeof openaiBatchResultLineSchema>;

class OpenAIResponsesBatch {
  constructor(
    private readonly options: {
      modelId: string;
      config: OpenAIConfig;
      prepareRequest: (
        request: OpenAIBatchRequest,
      ) => PromiseLike<OpenAIBatchPreparedRequest>;
    },
  ) {}

  async startBatch(
    options: BatchV4StartOptions<OpenAIBatchRequest>,
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
                  'The OpenAI Batch API does not support per-batch webhook URLs.',
              },
            },
          ];

    for (const request of options.requests) {
      const preparedRequest = await this.options.prepareRequest(request);

      fileParts.push(
        JSON.stringify({
          custom_id: request.id,
          method: 'POST',
          url: openaiBatchEndpoint,
          body: preparedRequest.body,
        }),
        '\n',
      );

      for (const warning of preparedRequest.warnings) {
        warnings.push({ requestId: request.id, warning });
      }
    }

    const filename = 'batch.jsonl';
    const file = new Blob(fileParts, {
      type: 'application/jsonl',
    });
    // Blob snapshots the strings, so release the potentially large input array.
    fileParts.length = 0;
    const formData = new FormData();
    formData.append('file', file, filename);
    formData.append('purpose', 'batch');
    formData.append('expires_after[anchor]', 'created_at');
    formData.append(
      'expires_after[seconds]',
      String(openaiBatchInputFileExpiresAfterSeconds),
    );

    const { value: uploadedFile } = await postToApi({
      url: this.getUrl('/files'),
      headers: combineHeaders(this.options.config.headers?.(), options.headers),
      body: {
        content: formData,
        values: {
          purpose: 'batch',
          'expires_after[anchor]': 'created_at',
          'expires_after[seconds]': String(
            openaiBatchInputFileExpiresAfterSeconds,
          ),
          file: {
            name: filename,
            type: file.type,
            size: file.size,
          },
        },
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiFilesResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.options.config.fetch,
    });

    const { value: batch } = await postJsonToApi({
      url: this.getUrl('/batches'),
      headers: combineHeaders(this.options.config.headers?.(), options.headers),
      body: {
        input_file_id: uploadedFile.id,
        endpoint: openaiBatchEndpoint,
        completion_window: '24h',
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiBatchResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.options.config.fetch,
    });

    return {
      batchId: batch.id,
      ...convertOpenAIBatchStatus(batch),
      warnings,
    };
  }

  async getBatchStatus(
    options: BatchV4OperationOptions,
  ): Promise<BatchV4Status> {
    const batch = await this.retrieveBatch(options);
    return convertOpenAIBatchStatus(batch);
  }

  async getBatchResults(
    options: BatchV4OperationOptions,
  ): Promise<ReadableStream<BatchV4ItemResult<LanguageModelV4GenerateResult>>> {
    const batch = await this.retrieveBatch(options);

    const batchStatus = convertOpenAIBatchStatus(batch);

    if (batchStatus.status === 'pending') {
      throw new InvalidArgumentError({
        argument: 'batchId',
        message: `OpenAI batch "${options.batchId}" is not complete.`,
      });
    }

    const fileIds = [batch.output_file_id, batch.error_file_id].filter(
      (fileId): fileId is string => fileId != null,
    );

    if (batchStatus.status === 'completed' && fileIds.length === 0) {
      throw new InvalidResponseDataError({
        data: batch,
        message: `OpenAI batch "${options.batchId}" completed without batch output.`,
      });
    }

    const iterator = this.iterateBatchResults({ fileIds, options });

    return convertAsyncIteratorToReadableStream(iterator);
  }

  private async retrieveBatch(
    options: BatchV4OperationOptions,
  ): Promise<OpenAIBatchResponse> {
    const { value: batch } = await getFromApi({
      url: this.getUrl(`/batches/${encodeURIComponent(options.batchId)}`),
      headers: combineHeaders(this.options.config.headers?.(), options.headers),
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiBatchResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.options.config.fetch,
      validateUrl: false,
    });

    return batch;
  }

  private async *iterateBatchResults({
    fileIds,
    options,
  }: {
    fileIds: string[];
    options: BatchV4OperationOptions;
  }): AsyncGenerator<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
    for (const fileId of fileIds) {
      const { value: lines } = await getFromApi({
        url: this.getUrl(`/files/${encodeURIComponent(fileId)}/content`),
        headers: combineHeaders(
          this.options.config.headers?.(),
          options.headers,
        ),
        failedResponseHandler: openaiFailedResponseHandler,
        successfulResponseHandler: createJsonLinesResponseHandler(
          openaiBatchResultLineSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.options.config.fetch,
        validateUrl: false,
      });

      for await (const line of lines) {
        yield await this.convertResultLine(line);
      }
    }
  }

  private async convertResultLine(
    line: OpenAIBatchResultLine,
  ): Promise<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
    if (line.error != null) {
      const error = {
        message: line.error.message,
        code: line.error.code,
      };

      if (line.error.code === 'batch_cancelled') {
        return { id: line.custom_id, status: 'cancelled', error };
      }

      if (line.error.code === 'batch_expired') {
        return { id: line.custom_id, status: 'expired', error };
      }

      return { id: line.custom_id, status: 'failed', error };
    }

    if (line.response == null) {
      return {
        id: line.custom_id,
        status: 'failed',
        error: {
          message:
            'OpenAI returned a batch result without a response or error.',
          code: 'invalid_batch_result',
        },
      };
    }

    if (line.response.status_code < 200 || line.response.status_code >= 300) {
      return {
        id: line.custom_id,
        status: 'failed',
        error: await convertOpenAIErrorResponse({
          body: line.response.body,
          statusCode: line.response.status_code,
        }),
      };
    }

    const conversion = await convertOpenAIResponsesBatchResponse(
      line.response.body,
    );
    if (!conversion.success) {
      return {
        id: line.custom_id,
        status: 'failed',
        error: conversion.error,
      };
    }

    return {
      id: line.custom_id,
      status: 'succeeded',
      result: conversion.result,
    };
  }

  private getUrl(path: string) {
    return this.options.config.url({
      modelId: this.options.modelId,
      path,
    });
  }
}

export class OpenAIResponsesBatchLanguageModel
  extends OpenAIResponsesLanguageModel
  implements BatchLanguageModelV4
{
  private readonly batch: OpenAIResponsesBatch;

  static [WORKFLOW_SERIALIZE](model: OpenAIResponsesLanguageModel) {
    return OpenAIResponsesLanguageModel[WORKFLOW_SERIALIZE](model);
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: OpenAIResponsesModelId;
    config: OpenAIConfig;
  }) {
    return new OpenAIResponsesBatchLanguageModel(
      options.modelId,
      options.config,
    );
  }

  constructor(modelId: OpenAIResponsesModelId, config: OpenAIConfig) {
    super(modelId, config);
    this.batch = new OpenAIResponsesBatch({
      modelId,
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

function convertOpenAIBatchStatus(batch: OpenAIBatchResponse): BatchV4Status {
  const status = mapOpenAIBatchStatus(batch.status);
  const firstError = batch.errors?.data?.[0];
  const requestCounts = convertOpenAIRequestCounts(batch.request_counts);
  const createdAt = convertUnixTimestamp(batch.created_at);
  const expiresAt = convertUnixTimestamp(batch.expires_at);

  return {
    status,
    rawStatus: batch.status,
    ...(requestCounts != null ? { requestCounts } : {}),
    ...(firstError != null
      ? {
          error: {
            message: firstError.message ?? 'OpenAI batch failed.',
            ...(firstError.code != null ? { code: firstError.code } : {}),
          },
        }
      : {}),
    ...(createdAt != null ? { createdAt } : {}),
    ...(expiresAt != null ? { expiresAt } : {}),
  };
}

function mapOpenAIBatchStatus(rawStatus: string): BatchV4Status['status'] {
  switch (rawStatus) {
    case 'completed':
      return 'completed';
    case 'failed':
    case 'expired':
    case 'cancelled':
      return 'failed';
    case 'validating':
    case 'in_progress':
    case 'finalizing':
    case 'cancelling':
    default:
      // Treat unknown provider states conservatively as non-terminal so callers
      // do not attempt to retrieve incomplete result artifacts.
      return 'pending';
  }
}

function convertOpenAIRequestCounts(
  counts: OpenAIBatchResponse['request_counts'],
): BatchV4Status['requestCounts'] | undefined {
  const total = counts?.total;
  const completed = counts?.completed;
  const failed = counts?.failed;

  return normalizeBatchRequestCounts({
    total,
    pending:
      total != null && completed != null && failed != null
        ? total - completed - failed
        : undefined,
    completed,
    failed,
  });
}

function convertUnixTimestamp(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return undefined;
  }

  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function convertOpenAIErrorResponse({
  body,
  statusCode,
}: {
  body: unknown;
  statusCode: number;
}): Promise<BatchV4Error> {
  const result = await safeValidateTypes({
    value: body,
    schema: openaiErrorDataSchema,
  });

  if (!result.success) {
    return {
      message: `OpenAI batch request failed with status code ${statusCode}.`,
      statusCode,
    };
  }

  return {
    message: result.value.error.message,
    type: result.value.error.type ?? undefined,
    code:
      result.value.error.code != null
        ? String(result.value.error.code)
        : undefined,
    statusCode,
  };
}

async function convertOpenAIResponsesBatchResponse(
  body: unknown,
): Promise<OpenAIBatchResponseConversion> {
  const validation = await safeValidateTypes({
    value: body,
    schema: openaiResponsesResponseSchema,
  });

  if (!validation.success) {
    return {
      success: false,
      error: {
        message: 'OpenAI returned an invalid Responses batch result.',
        code: 'invalid_response',
      },
    };
  }

  const response = validation.value;

  if (response.error != null) {
    return {
      success: false,
      error: {
        message: response.error.message,
        type: response.error.type,
        code: response.error.code,
      },
    };
  }

  if (response.output == null) {
    const detail = response.incomplete_details?.reason;
    return {
      success: false,
      error: {
        message:
          detail != null
            ? `OpenAI Responses returned no output (${detail}).`
            : 'OpenAI Responses returned no output.',
        code: 'invalid_response',
      },
    };
  }

  const content: LanguageModelV4GenerateResult['content'] = [];
  const logprobs: Array<NonNullable<OpenAIResponsesLogprobs>> = [];

  for (const part of response.output) {
    switch (part.type) {
      case 'reasoning': {
        const summaries =
          part.summary.length > 0
            ? part.summary
            : [{ type: 'summary_text' as const, text: '' }];

        for (const summary of summaries) {
          content.push({
            type: 'reasoning',
            text: summary.text,
            providerMetadata: {
              openai: {
                itemId: part.id,
                reasoningEncryptedContent: part.encrypted_content ?? null,
              } satisfies ResponsesReasoningProviderMetadata,
            },
          });
        }
        break;
      }

      case 'message': {
        for (const contentPart of part.content) {
          content.push({ type: 'text', text: contentPart.text });
          if (contentPart.logprobs != null) {
            logprobs.push(contentPart.logprobs);
          }
        }
        break;
      }

      case 'function_call':
      case 'custom_tool_call':
        return {
          success: false,
          error: {
            message:
              'OpenAI returned a tool call, but tool calls are not supported in AI SDK text batches.',
            code: 'unsupported_content',
          },
        };

      default:
        return {
          success: false,
          error: {
            message:
              `OpenAI returned an unsupported "${part.type}" output item ` +
              'in an AI SDK text batch.',
            code: 'unsupported_content',
          },
        };
    }
  }

  const providerMetadata: SharedV4ProviderMetadata = {
    openai: {
      responseId: response.id,
      ...(logprobs.length > 0 ? { logprobs } : {}),
      ...(typeof response.service_tier === 'string'
        ? { serviceTier: response.service_tier }
        : {}),
      ...(response.reasoning?.context != null
        ? { reasoningContext: response.reasoning.context }
        : {}),
    },
  };

  return {
    success: true,
    result: {
      content,
      finishReason: {
        unified: mapOpenAIResponseFinishReason({
          finishReason: response.incomplete_details?.reason,
          hasFunctionCall: false,
        }),
        raw: response.incomplete_details?.reason ?? undefined,
      },
      usage: convertOpenAIResponsesUsage(response.usage),
      response: {
        id: response.id,
        timestamp:
          response.created_at != null
            ? new Date(response.created_at * 1000)
            : undefined,
        modelId: response.model,
      },
      providerMetadata,
      warnings: [],
    },
  };
}
