import {
  InvalidArgumentError,
  InvalidResponseDataError,
  type Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  type Experimental_BatchV4Error as BatchV4Error,
  type Experimental_BatchV4ItemResult as BatchV4ItemResult,
  type Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  type Experimental_BatchV4StartOptions as BatchV4StartOptions,
  type Experimental_BatchV4StartResult as BatchV4StartResult,
  type Experimental_BatchV4Status as BatchV4Status,
  type LanguageModelV4GenerateResult,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertAsyncIteratorToReadableStream,
  createJsonLinesResponseHandler,
  createJsonResponseHandler,
  generateId,
  getFromApi,
  lazySchema,
  normalizeBatchRequestCounts,
  postJsonToApi,
  postToApi,
  resolve,
  safeValidateTypes,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
  type InferSchema,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { getModelPath } from './get-model-path';
import { googleFailedResponseHandler } from './google-error';
import {
  GoogleLanguageModel,
  responseSchema,
  type GoogleLanguageModelConfig,
} from './google-language-model';
import type { GoogleModelId } from './google-language-model-options';

const googleBatchInputFileMaxBytes = 2 * 1024 * 1024 * 1024;
const googleBatchInlineCreationMaxBytes = 20_000_000;
const supportedGoogleBatchContentTypes = new Set<
  LanguageModelV4GenerateResult['content'][number]['type']
>(['text', 'reasoning', 'source']);

type GoogleBatchRequest = Parameters<
  BatchLanguageModelV4['experimental_doStartBatch']
>[0]['requests'][number];

const googleRpcStatusSchema = z.object({
  code: z.union([z.number(), z.string()]).nullish(),
  message: z.string().nullish(),
  status: z.string().nullish(),
});

const googleBatchStatsSchema = z.object({
  requestCount: z.union([z.string(), z.number()]).nullish(),
  successfulRequestCount: z.union([z.string(), z.number()]).nullish(),
  failedRequestCount: z.union([z.string(), z.number()]).nullish(),
  pendingRequestCount: z.union([z.string(), z.number()]).nullish(),
});

const googleBatchOutputSchema = z.object({
  responsesFile: z.string().nullish(),
  inlinedResponses: z
    .object({
      inlinedResponses: z.array(
        z.object({
          metadata: z.object({
            key: z.string(),
          }),
          response: z.unknown().nullish(),
          error: googleRpcStatusSchema.nullish(),
        }),
      ),
    })
    .nullish(),
});

const googleBatchOperationSchema = lazySchema(() =>
  zodSchema(
    z.object({
      name: z.string(),
      metadata: z
        .object({
          state: z.string().nullish(),
          createTime: z.string().nullish(),
          batchStats: googleBatchStatsSchema.nullish(),
          output: googleBatchOutputSchema.nullish(),
        })
        .nullish(),
      done: z.boolean().nullish(),
      error: googleRpcStatusSchema.nullish(),
      response: googleBatchOutputSchema.nullish(),
    }),
  ),
);

type GoogleBatchOperation = InferSchema<typeof googleBatchOperationSchema>;

const googleFileUploadResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      file: z.object({
        name: z.string(),
      }),
    }),
  ),
);

const googleBatchResultLineSchema = lazySchema(() =>
  zodSchema(
    z.object({
      key: z.string(),
      response: z.unknown().nullish(),
      error: googleRpcStatusSchema.nullish(),
    }),
  ),
);

type GoogleBatchResultLine = InferSchema<typeof googleBatchResultLineSchema>;

const googleBatchResponsePreviewSchema = lazySchema(() =>
  zodSchema(
    z.object({
      candidates: z.array(z.unknown()).nullish(),
      promptFeedback: z
        .object({
          blockReason: z.string().nullish(),
        })
        .nullish(),
    }),
  ),
);

export class GoogleBatchLanguageModel
  extends GoogleLanguageModel
  implements BatchLanguageModelV4
{
  private readonly batchConfig: GoogleLanguageModelConfig;
  private readonly batchGenerateId: () => string;

  static [WORKFLOW_SERIALIZE](model: GoogleLanguageModel) {
    return GoogleLanguageModel[WORKFLOW_SERIALIZE](model);
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: GoogleLanguageModelConfig;
  }) {
    return new GoogleBatchLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: GoogleModelId, config: GoogleLanguageModelConfig) {
    super(modelId, config);
    this.batchConfig = config;
    this.batchGenerateId = config.generateId ?? generateId;
  }

  async experimental_doStartBatch(
    options: BatchV4StartOptions<GoogleBatchRequest>,
  ): Promise<BatchV4StartResult> {
    const warnings: BatchV4StartResult['warnings'] = [];
    const displayName = `ai-sdk-batch-${this.batchGenerateId()}`;
    const inlinedRequests: Array<{
      request: unknown;
      metadata: { key: string };
    }> = [];
    const inlineBatchBody = {
      batch: {
        displayName,
        ...(options.webhookUrl != null && {
          webhookConfig: { uris: [options.webhookUrl] },
        }),
        inputConfig: {
          requests: { requests: inlinedRequests },
        },
      },
    };
    const textEncoder = new TextEncoder();
    let inlineInputBytes = textEncoder.encode(
      JSON.stringify(inlineBatchBody),
    ).byteLength;
    let fileParts: string[] | undefined;

    for (const request of options.requests) {
      const preparedRequest = await this.getArgs(request.options);
      const inlinedRequest = {
        request: preparedRequest.args,
        metadata: { key: request.id },
      };

      if (fileParts == null) {
        const requestBytes = textEncoder.encode(
          JSON.stringify(inlinedRequest),
        ).byteLength;
        const nextInlineInputBytes =
          inlineInputBytes +
          requestBytes +
          (inlinedRequests.length > 0 ? 1 : 0);

        if (nextInlineInputBytes < googleBatchInlineCreationMaxBytes) {
          inlinedRequests.push(inlinedRequest);
          inlineInputBytes = nextInlineInputBytes;
        } else {
          fileParts = [];
          for (const previousRequest of inlinedRequests) {
            fileParts.push(
              JSON.stringify({
                key: previousRequest.metadata.key,
                request: previousRequest.request,
              }),
              '\n',
            );
          }
          inlinedRequests.length = 0;
          fileParts.push(
            JSON.stringify({
              key: request.id,
              request: preparedRequest.args,
            }),
            '\n',
          );
        }
      } else {
        fileParts.push(
          JSON.stringify({
            key: request.id,
            request: preparedRequest.args,
          }),
          '\n',
        );
      }

      for (const warning of preparedRequest.warnings) {
        warnings.push({ requestId: request.id, warning });
      }
    }

    const headers = await this.getHeaders(options.headers);
    const createUrl = `${this.batchConfig.baseURL}/${getModelPath(
      this.modelId,
    )}:batchGenerateContent`;
    let operation: GoogleBatchOperation;

    if (fileParts == null) {
      const { value } = await postJsonToApi({
        url: createUrl,
        headers,
        body: inlineBatchBody,
        failedResponseHandler: googleFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          googleBatchOperationSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.batchConfig.fetch,
      });
      operation = value;
    } else {
      const inputFile = new Blob(fileParts, { type: 'application/jsonl' });
      // Blob snapshots the strings, so release the potentially large input array.
      fileParts.length = 0;
      if (inputFile.size > googleBatchInputFileMaxBytes) {
        throw new InvalidArgumentError({
          argument: 'requests',
          message: 'Google batch input files must not exceed 2 GB.',
        });
      }

      const { value: uploadUrl } = await postJsonToApi({
        url: `${this.getBaseOrigin()}/upload/v1beta/files`,
        headers: combineHeaders(headers, {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(inputFile.size),
          'X-Goog-Upload-Header-Content-Type': 'application/jsonl',
        }),
        body: {
          file: {
            display_name: `${displayName}-input`,
          },
        },
        failedResponseHandler: googleFailedResponseHandler,
        successfulResponseHandler: googleUploadUrlResponseHandler,
        abortSignal: options.abortSignal,
        fetch: this.batchConfig.fetch,
      });

      const { value: uploadedFile } = await postToApi({
        url: uploadUrl,
        headers: {
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize',
          'Content-Type': 'application/jsonl',
        },
        body: {
          content: inputFile,
          values: {
            byteLength: inputFile.size,
            mediaType: 'application/jsonl',
          },
        },
        failedResponseHandler: googleFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          googleFileUploadResponseSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.batchConfig.fetch,
      });

      const { value } = await postJsonToApi({
        url: createUrl,
        headers,
        body: {
          batch: {
            displayName,
            ...(options.webhookUrl != null && {
              webhookConfig: { uris: [options.webhookUrl] },
            }),
            inputConfig: {
              fileName: uploadedFile.file.name,
            },
          },
        },
        failedResponseHandler: googleFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          googleBatchOperationSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.batchConfig.fetch,
      });
      operation = value;
    }

    return {
      batchId: operation.name,
      ...convertGoogleBatchStatus(operation),
      warnings,
    };
  }

  async experimental_doGetBatchStatus(
    options: BatchV4OperationOptions,
  ): Promise<BatchV4Status> {
    return convertGoogleBatchStatus(await this.retrieveBatch(options));
  }

  async experimental_doGetBatchResults(
    options: BatchV4OperationOptions,
  ): Promise<ReadableStream<BatchV4ItemResult<LanguageModelV4GenerateResult>>> {
    const operation = await this.retrieveBatch(options);
    const batchStatus = convertGoogleBatchStatus(operation);

    if (batchStatus.status === 'pending') {
      throw new InvalidArgumentError({
        argument: 'batchId',
        message: `Google batch "${options.batchId}" is not complete.`,
      });
    }

    const inlinedResponses =
      operation.metadata?.output?.inlinedResponses?.inlinedResponses ??
      operation.response?.inlinedResponses?.inlinedResponses;

    if (inlinedResponses != null) {
      return convertAsyncIteratorToReadableStream(
        this.iterateBatchResults(
          inlinedResponses.map(result => ({
            key: result.metadata.key,
            response: result.response,
            error: result.error,
          })),
        ),
      );
    }

    const responsesFile =
      operation.metadata?.output?.responsesFile ??
      operation.response?.responsesFile;

    if (responsesFile == null) {
      if (batchStatus.status === 'completed') {
        throw new InvalidResponseDataError({
          data: operation,
          message: `Google batch "${options.batchId}" completed without batch output.`,
        });
      }
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    }

    const encodedResponsesFile = responsesFile
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    const { value: lines } = await getFromApi({
      url: `${this.getBaseOrigin()}/download/v1beta/${encodedResponsesFile}:download?alt=media`,
      headers: await this.getHeaders(options.headers),
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonLinesResponseHandler(
        googleBatchResultLineSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.batchConfig.fetch,
      validateUrl: false,
    });

    return convertAsyncIteratorToReadableStream(
      this.iterateBatchResults(lines),
    );
  }

  private async retrieveBatch(
    options: BatchV4OperationOptions,
  ): Promise<GoogleBatchOperation> {
    const { value: operation } = await getFromApi({
      url: `${this.batchConfig.baseURL}/${options.batchId}`,
      headers: await this.getHeaders(options.headers),
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleBatchOperationSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.batchConfig.fetch,
      validateUrl: false,
    });

    return operation;
  }

  private async *iterateBatchResults(
    results:
      | Iterable<GoogleBatchResultLine>
      | AsyncIterable<GoogleBatchResultLine>,
  ): AsyncGenerator<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
    for await (const line of results) {
      if (line.error != null) {
        const error = convertGoogleRpcError(
          line.error,
          'Google batch request failed.',
        );
        const status =
          line.error.status === 'CANCELLED' || String(line.error.code) === '1'
            ? 'cancelled'
            : 'failed';

        yield { id: line.key, status, error };
        continue;
      }

      if (line.response == null) {
        yield {
          id: line.key,
          status: 'failed',
          error: {
            message:
              'Google returned a batch result without a response or error.',
            code: 'invalid_batch_result',
          },
        };
        continue;
      }

      const preview = await safeValidateTypes({
        value: line.response,
        schema: googleBatchResponsePreviewSchema,
      });
      if (
        preview.success &&
        (preview.value.candidates == null ||
          preview.value.candidates.length === 0)
      ) {
        const promptFeedback = preview.value.promptFeedback ?? undefined;
        const blockReason = promptFeedback?.blockReason ?? undefined;
        yield {
          id: line.key,
          status: 'failed',
          error: {
            message:
              blockReason == null
                ? 'Google returned a batch response without any candidates.'
                : `Google blocked the batch request (${blockReason}).`,
            code: blockReason == null ? 'invalid_response' : 'prompt_blocked',
            ...(blockReason != null ? { type: blockReason } : {}),
          },
          ...(promptFeedback != null
            ? {
                providerMetadata: {
                  google: {
                    promptFeedback: {
                      blockReason: promptFeedback.blockReason ?? null,
                    },
                  },
                },
              }
            : {}),
        };
        continue;
      }

      const response = await safeValidateTypes({
        value: line.response,
        schema: responseSchema,
      });
      if (!response.success) {
        yield {
          id: line.key,
          status: 'failed',
          error: {
            message: 'Google returned an invalid GenerateContent batch result.',
            code: 'invalid_response',
          },
        };
        continue;
      }

      const result = this.convertGenerateContentResponse({
        response: response.value,
        warnings: [],
        providerOptionsNames: ['google'],
      });
      const unsupportedPart = result.content.find(
        part => !supportedGoogleBatchContentTypes.has(part.type),
      );

      if (unsupportedPart != null) {
        yield {
          id: line.key,
          status: 'failed',
          error: {
            message:
              `Google returned a "${unsupportedPart.type}" content block, ` +
              'but that content is not supported in AI SDK text batches.',
            code: 'unsupported_content',
          },
        };
        continue;
      }

      yield { id: line.key, status: 'succeeded', result };
    }
  }

  private async getHeaders(headers?: Record<string, string | undefined>) {
    return combineHeaders(
      this.batchConfig.headers
        ? await resolve(this.batchConfig.headers)
        : undefined,
      headers,
    );
  }

  private getBaseOrigin() {
    return this.batchConfig.baseURL.replace(/\/v1beta$/, '');
  }
}

function convertGoogleBatchStatus(
  operation: GoogleBatchOperation,
): BatchV4Status {
  const rawStatus = operation.metadata?.state ?? undefined;
  const requestCounts = convertGoogleRequestCounts(
    operation.metadata?.batchStats,
  );
  const createdAt = operation.metadata?.createTime ?? undefined;
  const error =
    operation.error != null
      ? convertGoogleRpcError(operation.error, 'Google batch failed.')
      : undefined;

  return {
    status: mapGoogleBatchStatus({
      rawStatus,
      done: operation.done ?? undefined,
      hasError: error != null,
    }),
    ...(rawStatus != null ? { rawStatus } : {}),
    ...(requestCounts != null ? { requestCounts } : {}),
    ...(error != null ? { error } : {}),
    ...(createdAt != null ? { createdAt } : {}),
  };
}

function mapGoogleBatchStatus({
  rawStatus,
  done,
  hasError,
}: {
  rawStatus?: string;
  done?: boolean;
  hasError: boolean;
}): BatchV4Status['status'] {
  if (hasError) {
    return 'failed';
  }

  if (rawStatus == null) {
    return done ? 'completed' : 'pending';
  }

  const normalizedStatus = rawStatus.replace(/^(?:BATCH|JOB)_STATE_/, '');
  switch (normalizedStatus) {
    case 'SUCCEEDED':
      return 'completed';
    case 'FAILED':
    case 'CANCELLED':
    case 'EXPIRED':
      return 'failed';
    case 'UNSPECIFIED':
    case 'PENDING':
    case 'RUNNING':
    default:
      return 'pending';
  }
}

function convertGoogleRequestCounts(
  counts: NonNullable<GoogleBatchOperation['metadata']>['batchStats'],
): BatchV4Status['requestCounts'] | undefined {
  const total = parseCount(counts?.requestCount);
  const completed = parseCount(counts?.successfulRequestCount ?? 0);
  const failed = parseCount(counts?.failedRequestCount ?? 0);
  const pending = parseCount(counts?.pendingRequestCount ?? 0);

  return normalizeBatchRequestCounts({
    total,
    pending,
    completed,
    failed,
  });
}

function parseCount(value: string | number | null | undefined) {
  const count =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    ? count
    : undefined;
}

function convertGoogleRpcError(
  error: InferSchema<typeof googleRpcStatusSchema>,
  fallbackMessage: string,
): BatchV4Error {
  return {
    message: error.message ?? fallbackMessage,
    ...(error.status != null ? { type: error.status } : {}),
    ...(error.code != null ? { code: String(error.code) } : {}),
  };
}

const googleUploadUrlResponseHandler: ResponseHandler<string> = async ({
  response,
}) => {
  const uploadUrl = response.headers.get('x-goog-upload-url');
  if (uploadUrl == null) {
    throw new InvalidResponseDataError({
      data: response.headers,
      message: 'Google did not return a resumable upload URL.',
    });
  }

  return { value: uploadUrl };
};
