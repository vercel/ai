import {
  APICallError,
  type Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  type Experimental_BatchV4ItemResult as BatchV4ItemResult,
  type Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  type Experimental_BatchV4StartOptions as BatchV4StartOptions,
  type Experimental_BatchV4StartResult as BatchV4StartResult,
  type Experimental_BatchV4Status as BatchV4Status,
  type Experimental_LanguageModelV4BatchRequest as LanguageModelV4BatchRequest,
  type LanguageModelV4GenerateResult,
  type SharedV4ProviderMetadata,
  type SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertAsyncIteratorToReadableStream,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  parseJSON,
  postJsonToApi,
  resolve,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import {
  GatewayLanguageModel,
  type GatewayChatConfig,
} from './gateway-language-model';
import type { GatewayModelId } from './gateway-language-model-settings';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';

export class GatewayBatchLanguageModel
  extends GatewayLanguageModel
  implements BatchLanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: GatewayBatchLanguageModel) {
    return GatewayLanguageModel[WORKFLOW_SERIALIZE](model);
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GatewayModelId;
    config: GatewayChatConfig;
  }) {
    return new GatewayBatchLanguageModel(options.modelId, options.config);
  }

  constructor(modelId: GatewayModelId, config: GatewayChatConfig) {
    super(modelId, config);
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
    const forwardedProviderOptions = omitGatewayIdempotencyKey(providerOptions);

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
          ...(forwardedProviderOptions != null && {
            providerOptions: forwardedProviderOptions,
          }),
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
      // Preserve cancellation: an aborted batch start may still have been
      // accepted server-side, so it must not surface as a retryable 500.
      if (isAbortOrTimeoutError(error)) {
        throw error;
      }
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
      if (isAbortOrTimeoutError(error)) {
        throw error;
      }
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
      if (isAbortOrTimeoutError(error)) {
        throw error;
      }
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  private getBatchUrl(path: 'results' | 'start' | 'status') {
    return `${this.config.baseURL}/batch/${path}`;
  }

  private getBatchConfigHeaders() {
    return {
      'ai-model-id': this.modelId,
    };
  }
}

/**
 * Extracts the optional Gateway idempotency key from
 * `providerOptions.gateway.idempotencyKey`. It is sent as the
 * `idempotency-key` request header — the Gateway's replay contract for batch
 * starts — and stripped from the forwarded body by
 * `omitGatewayIdempotencyKey`.
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

/**
 * Removes `gateway.idempotencyKey` from the providerOptions forwarded in the
 * request body. The key is transport metadata (it rides the `idempotency-key`
 * header); the Gateway hashes the raw body for replay payload identity but
 * normalizes the header separately, so keeping it out of the payload prevents
 * equivalent retries from producing different digests (a false 422).
 */
function omitGatewayIdempotencyKey(
  providerOptions: SharedV4ProviderOptions | undefined,
): SharedV4ProviderOptions | undefined {
  const gatewayOptions = providerOptions?.gateway;
  if (
    gatewayOptions == null ||
    typeof gatewayOptions !== 'object' ||
    Array.isArray(gatewayOptions) ||
    !('idempotencyKey' in gatewayOptions)
  ) {
    return providerOptions;
  }

  const { idempotencyKey: _idempotencyKey, ...restGatewayOptions } =
    gatewayOptions as Record<string, unknown>;
  const restProviderOptions: Record<string, unknown> = { ...providerOptions };
  if (Object.keys(restGatewayOptions).length === 0) {
    delete restProviderOptions.gateway;
  } else {
    restProviderOptions.gateway = restGatewayOptions;
  }
  if (Object.keys(restProviderOptions).length === 0) {
    return undefined;
  }
  return restProviderOptions as SharedV4ProviderOptions;
}

/**
 * Matches cancellation errors (`AbortError`/`TimeoutError`), which
 * `asGatewayError` would otherwise wrap into a retryable Gateway 500. Kept
 * local because `isAbortError` is not exported from `@ai-sdk/provider-utils`;
 * `DOMException` does not extend `Error`, so both must be checked.
 */
function isAbortOrTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error || error instanceof DOMException)) {
    return false;
  }
  return error.name === 'AbortError' || error.name === 'TimeoutError';
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
  const item =
    parsed as unknown as BatchV4ItemResult<LanguageModelV4GenerateResult>;
  // JSON carries `response.timestamp` as an ISO string; core expects a Date
  // (`GeneratedFile`-style consumers call `.toISOString()`).
  if (item.status === 'succeeded') {
    const response = item.result?.response;
    if (response !== undefined && typeof response.timestamp === 'string') {
      response.timestamp = new Date(response.timestamp);
    }
  }
  return item;
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
