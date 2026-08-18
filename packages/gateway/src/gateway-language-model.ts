import {
  APICallError,
  type Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  type Experimental_BatchV4ItemResult as BatchV4ItemResult,
  type Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  type Experimental_BatchV4StartOptions as BatchV4StartOptions,
  type Experimental_BatchV4StartResult as BatchV4StartResult,
  type Experimental_BatchV4Status as BatchV4Status,
  type Experimental_LanguageModelV4BatchRequest as LanguageModelV4BatchRequest,
  type LanguageModelV4CallOptions,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
  type SharedV4ProviderMetadata,
  type SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertAsyncIteratorToReadableStream,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  parseJSON,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type ParseResult,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import type { GatewayConfig } from './gateway-config';
import type { GatewayModelId } from './gateway-language-model-settings';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';

type GatewayChatConfig = GatewayConfig & {
  provider: string;
  o11yHeaders: Resolvable<Record<string, string>>;
};

export class GatewayLanguageModel implements BatchLanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedUrls = { '*/*': [/.*/] };

  static [WORKFLOW_SERIALIZE](model: GatewayLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GatewayModelId;
    config: GatewayChatConfig;
  }) {
    return new GatewayLanguageModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: GatewayModelId,
    private readonly config: GatewayChatConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs(options: LanguageModelV4CallOptions) {
    const { abortSignal: _abortSignal, ...optionsWithoutSignal } = options;

    return {
      args: this.maybeEncodeFileParts(optionsWithoutSignal),
      warnings: [],
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, warnings } = await this.getArgs(options);
    const { abortSignal } = options;

    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;

    try {
      const {
        responseHeaders,
        value: responseBody,
        rawValue: rawResponse,
      } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          options.headers,
          this.getModelConfigHeaders(this.modelId, false),
          await resolve(this.config.o11yHeaders),
        ),
        body: args,
        successfulResponseHandler: createJsonResponseHandler(z.any()),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        ...responseBody,
        request: { body: args },
        response: { headers: responseHeaders, body: rawResponse },
        warnings,
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const { args, warnings } = await this.getArgs(options);
    const { abortSignal } = options;

    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;

    try {
      const { value: response, responseHeaders } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          options.headers,
          this.getModelConfigHeaders(this.modelId, true),
          await resolve(this.config.o11yHeaders),
        ),
        body: args,
        successfulResponseHandler: createEventSourceResponseHandler(z.any()),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        stream: response.pipeThrough(
          new TransformStream<
            ParseResult<LanguageModelV4StreamPart>,
            LanguageModelV4StreamPart
          >({
            start(controller) {
              if (warnings.length > 0) {
                controller.enqueue({ type: 'stream-start', warnings });
              }
            },
            transform(chunk, controller) {
              if (chunk.success) {
                const streamPart = chunk.value;

                // Handle raw chunks: if this is a raw chunk from the gateway API,
                // only emit it if includeRawChunks is true
                if (streamPart.type === 'raw' && !options.includeRawChunks) {
                  return; // Skip raw chunks if not requested
                }

                if (
                  streamPart.type === 'response-metadata' &&
                  streamPart.timestamp &&
                  typeof streamPart.timestamp === 'string'
                ) {
                  streamPart.timestamp = new Date(streamPart.timestamp);
                }

                controller.enqueue(streamPart);
              } else {
                controller.error(
                  (chunk as { success: false; error: unknown }).error,
                );
              }
            },
          }),
        ),
        request: { body: args },
        response: { headers: responseHeaders },
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  /**
   * Starts a durable batch of text-generation requests through the Gateway's
   * async batch surface (`POST {baseURL}/batch/start`). The returned
   * `batchId` is the Gateway job id — provider-native batch ids stay
   * server-side, so status and results always route back through the
   * Gateway job.
   */
  async experimental_doStartBatch({
    requests,
    providerOptions,
    headers,
    abortSignal,
  }: BatchV4StartOptions<LanguageModelV4BatchRequest>): Promise<BatchV4StartResult> {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;

    const idempotencyKey = getGatewayBatchIdempotencyKey(providerOptions);

    try {
      const { value: responseBody } = await postJsonToApi({
        url: this.getBatchUrl('start'),
        headers: combineHeaders(
          resolvedHeaders,
          headers,
          this.getBatchConfigHeaders(),
          await resolve(this.config.o11yHeaders),
          idempotencyKey != null
            ? { 'idempotency-key': idempotencyKey }
            : undefined,
        ),
        body: {
          modelId: this.modelId,
          requests: requests.map(request => ({
            id: request.id,
            options: this.maybeEncodeFileParts(request.options),
          })),
          ...(providerOptions != null && { providerOptions }),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayBatchStartResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        batchId: responseBody.batchId,
        ...convertGatewayBatchStatus(responseBody),
        warnings: (responseBody.warnings ??
          []) as unknown as BatchV4StartResult['warnings'],
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  /**
   * Retrieves the lifecycle status of a Gateway batch job
   * (`POST {baseURL}/batch/status`).
   */
  async experimental_doGetBatchStatus({
    batchId,
    headers,
    abortSignal,
  }: BatchV4OperationOptions): Promise<BatchV4Status> {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;

    try {
      const { value: responseBody } = await postJsonToApi({
        url: this.getBatchUrl('status'),
        headers: combineHeaders(
          resolvedHeaders,
          headers,
          this.getBatchConfigHeaders(),
          await resolve(this.config.o11yHeaders),
        ),
        body: { batchId },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayBatchStatusResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return convertGatewayBatchStatus(responseBody);
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  /**
   * Streams the per-request results of a terminal Gateway batch job
   * (`POST {baseURL}/batch/results`, `application/x-ndjson`: one
   * `BatchV4ItemResult` JSON object per line). Items are validated minimally
   * (id + status) and passed through — the Gateway sanitizes them
   * server-side. The route responds 400 while the batch is non-terminal.
   */
  async experimental_doGetBatchResults({
    batchId,
    headers,
    abortSignal,
  }: BatchV4OperationOptions): Promise<
    ReadableStream<BatchV4ItemResult<LanguageModelV4GenerateResult>>
  > {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;

    try {
      const { value: stream } = await postJsonToApi({
        url: this.getBatchUrl('results'),
        headers: combineHeaders(
          resolvedHeaders,
          headers,
          this.getBatchConfigHeaders(),
          await resolve(this.config.o11yHeaders),
        ),
        body: { batchId },
        successfulResponseHandler: async ({
          response,
          url,
          requestBodyValues,
        }: {
          url: string;
          requestBodyValues: unknown;
          response: Response;
        }) => {
          if (response.body == null) {
            throw new APICallError({
              message: 'Batch results response body is empty',
              url,
              requestBodyValues,
              statusCode: response.status,
            });
          }
          return {
            value: response.body,
            responseHeaders: Object.fromEntries([...response.headers]),
          };
        },
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return convertAsyncIteratorToReadableStream(
        parseGatewayBatchResultLines(stream),
      );
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  /**
   * Encodes inline `Uint8Array` file data to a base64 string in place.
   * @param options - The options to encode.
   * @returns The options with the file data encoded.
   */
  private maybeEncodeFileParts<
    T extends Pick<LanguageModelV4CallOptions, 'prompt'>,
  >(options: T): T {
    for (const message of options.prompt) {
      if (!Array.isArray(message.content)) {
        continue;
      }
      for (const part of message.content) {
        if (part.type === 'file' || part.type === 'reasoning-file') {
          part.data = maybeBase64EncodeFileData(part.data);
        } else if (
          part.type === 'tool-result' &&
          part.output.type === 'content'
        ) {
          for (const contentPart of part.output.value) {
            if (contentPart.type === 'file') {
              contentPart.data = maybeBase64EncodeFileData(contentPart.data);
            }
          }
        }
      }
    }
    return options;
  }

  private getUrl() {
    return `${this.config.baseURL}/language-model`;
  }

  private getBatchUrl(path: 'results' | 'start' | 'status') {
    return `${this.config.baseURL}/batch/${path}`;
  }

  private getModelConfigHeaders(modelId: string, streaming: boolean) {
    return {
      'ai-language-model-specification-version': '4',
      'ai-language-model-id': modelId,
      'ai-language-model-streaming': String(streaming),
    };
  }

  private getBatchConfigHeaders() {
    return {
      'ai-model-id': this.modelId,
    };
  }
}

function maybeBase64EncodeFileData<T extends { type: string }>(data: T): T {
  if (data.type === 'data') {
    const bytes = (data as { data?: unknown }).data;
    if (bytes instanceof Uint8Array) {
      return { ...data, data: Buffer.from(bytes).toString('base64') } as T;
    }
  }
  return data;
}

/**
 * Extracts the optional Gateway idempotency key from
 * `providerOptions.gateway.idempotencyKey`. It is sent as the
 * `idempotency-key` request header — the Gateway's replay contract for batch
 * starts — while the providerOptions body is forwarded unchanged.
 */
function getGatewayBatchIdempotencyKey(
  providerOptions: SharedV4ProviderOptions | undefined,
): string | undefined {
  const gatewayOptions = providerOptions?.gateway;
  if (
    gatewayOptions == null ||
    typeof gatewayOptions !== 'object' ||
    Array.isArray(gatewayOptions)
  ) {
    return undefined;
  }
  const key = (gatewayOptions as { idempotencyKey?: unknown }).idempotencyKey;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
}

function convertGatewayBatchStatus(body: {
  status: 'completed' | 'failed' | 'pending';
  rawStatus?: string | null;
  requestCounts?: {
    total?: number | null;
    pending?: number | null;
    completed?: number | null;
    failed?: number | null;
  } | null;
  error?: {
    message: string;
    type?: string | null;
    code?: string | null;
    statusCode?: number | null;
  } | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  providerMetadata?: Record<string, Record<string, unknown>> | null;
}): BatchV4Status {
  const requestCounts = convertGatewayBatchRequestCounts(body.requestCounts);

  return {
    status: body.status,
    ...(body.rawStatus != null && { rawStatus: body.rawStatus }),
    ...(requestCounts != null && { requestCounts }),
    ...(body.error != null && {
      error: {
        message: body.error.message,
        ...(body.error.type != null && { type: body.error.type }),
        ...(body.error.code != null && { code: body.error.code }),
        ...(body.error.statusCode != null && {
          statusCode: body.error.statusCode,
        }),
      },
    }),
    ...(body.createdAt != null && { createdAt: body.createdAt }),
    ...(body.expiresAt != null && { expiresAt: body.expiresAt }),
    ...(body.providerMetadata != null && {
      providerMetadata: body.providerMetadata as SharedV4ProviderMetadata,
    }),
  };
}

/**
 * The spec's `requestCounts` requires all four counters; the Gateway's
 * persisted descriptor allows partial counts. Only forward counts when the
 * full set is present rather than fabricating zeros.
 */
function convertGatewayBatchRequestCounts(
  counts:
    | {
        total?: number | null;
        pending?: number | null;
        completed?: number | null;
        failed?: number | null;
      }
    | null
    | undefined,
): BatchV4Status['requestCounts'] | undefined {
  if (
    counts == null ||
    typeof counts.total !== 'number' ||
    typeof counts.pending !== 'number' ||
    typeof counts.completed !== 'number' ||
    typeof counts.failed !== 'number'
  ) {
    return undefined;
  }

  return {
    total: counts.total,
    pending: counts.pending,
    completed: counts.completed,
    failed: counts.failed,
  };
}

/**
 * Incremental NDJSON line splitter for the batch results stream: buffers
 * partial lines across chunks and flushes a trailing line without a final
 * newline. Each non-empty line is one `BatchV4ItemResult` JSON object.
 *
 * @param stream - The raw NDJSON byte stream from the batch results route.
 * @yields One minimally-validated `BatchV4ItemResult` per non-empty line.
 */
async function* parseGatewayBatchResultLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        finished = true;
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let lineEnd = buffer.indexOf('\n');
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).replace(/\r$/, '');
        buffer = buffer.slice(lineEnd + 1);

        if (line.trim().length > 0) {
          yield await parseGatewayBatchResultLine(line);
        }

        lineEnd = buffer.indexOf('\n');
      }
    }

    const finalLine = buffer.replace(/\r$/, '');
    if (finalLine.trim().length > 0) {
      yield await parseGatewayBatchResultLine(finalLine);
    }
  } finally {
    if (!finished) {
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}

async function parseGatewayBatchResultLine(
  line: string,
): Promise<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
  // Minimal validation (id + status); items pass through otherwise — the
  // Gateway already sanitizes them server-side.
  const parsed = await parseJSON({
    text: line,
    schema: gatewayBatchItemResultLineSchema,
  });
  return parsed as unknown as BatchV4ItemResult<LanguageModelV4GenerateResult>;
}

const gatewayBatchItemResultLineSchema = z
  .object({
    id: z.string(),
    status: z.enum(['cancelled', 'expired', 'failed', 'succeeded']),
  })
  .catchall(z.unknown());

const gatewayBatchErrorSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
  code: z.string().nullish(),
  statusCode: z.number().nullish(),
});

const gatewayBatchRequestCountsSchema = z.object({
  total: z.number().nullish(),
  pending: z.number().nullish(),
  completed: z.number().nullish(),
  failed: z.number().nullish(),
});

const gatewayBatchProviderMetadataSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
);

const gatewayBatchStatusFieldsSchema = z.object({
  status: z.enum(['completed', 'failed', 'pending']),
  rawStatus: z.string().nullish(),
  requestCounts: gatewayBatchRequestCountsSchema.nullish(),
  error: gatewayBatchErrorSchema.nullish(),
  createdAt: z.string().nullish(),
  expiresAt: z.string().nullish(),
  providerMetadata: gatewayBatchProviderMetadataSchema.nullish(),
});

const gatewayBatchStartResponseSchema = gatewayBatchStatusFieldsSchema.extend({
  batchId: z.string(),
  warnings: z
    .array(
      z
        .object({
          requestId: z.string().nullish(),
          warning: z.unknown(),
        })
        .catchall(z.unknown()),
    )
    .nullish(),
});

const gatewayBatchStatusResponseSchema = gatewayBatchStatusFieldsSchema;
