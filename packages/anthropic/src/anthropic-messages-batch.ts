import {
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  type Experimental_BatchV4ItemResult as BatchV4ItemResult,
  type Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  type Experimental_BatchV4StartResult as BatchV4StartResult,
  type Experimental_BatchV4Status as BatchV4Status,
  type JSONObject,
  type LanguageModelV4GenerateResult,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertAsyncIteratorToReadableStream,
  createJsonLinesResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  lazySchema,
  normalizeBatchRequestCounts,
  normalizeHeaders,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  safeValidateTypes,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  anthropicResponseSchema,
  type AnthropicReasoningMetadata,
  type AnthropicResponseContextManagement,
  type AnthropicStopDetails,
} from './anthropic-api';
import { anthropicFailedResponseHandler } from './anthropic-error';
import {
  AnthropicLanguageModel,
  type AnthropicLanguageModelConfig,
} from './anthropic-language-model';
import {
  anthropicLanguageModelOptions,
  type AnthropicModelId,
} from './anthropic-language-model-options';
import type {
  AnthropicMessageMetadata,
  AnthropicUsageIteration,
} from './anthropic-message-metadata';
import { convertAnthropicUsage } from './convert-anthropic-usage';
import { mapAnthropicStopReason } from './map-anthropic-stop-reason';

const anthropicBatchRequestIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

const anthropicBatchProviderOptionsSchema = anthropicLanguageModelOptions.pick({
  anthropicBeta: true,
});

type AnthropicBatchRequest = Parameters<
  BatchLanguageModelV4['experimental_doStartBatch']
>[0]['requests'][number];

const anthropicBatchResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      type: z.literal('message_batch'),
      processing_status: z.string(),
      request_counts: z.object({
        processing: z.number(),
        succeeded: z.number(),
        errored: z.number(),
        canceled: z.number(),
        expired: z.number(),
      }),
      created_at: z.string(),
      expires_at: z.string(),
      archived_at: z.string().nullish(),
      results_url: z.string().nullish(),
    }),
  ),
);

type AnthropicBatchResponse = InferSchema<typeof anthropicBatchResponseSchema>;

const anthropicBatchResultLineSchema = lazySchema(() =>
  zodSchema(
    z.object({
      custom_id: z.string(),
      result: z.discriminatedUnion('type', [
        z.object({
          type: z.literal('succeeded'),
          message: z.unknown(),
        }),
        z.object({
          type: z.literal('errored'),
          error: z.object({
            type: z.literal('error'),
            error: z.object({
              type: z.string(),
              message: z.string(),
            }),
            request_id: z.string().nullish(),
          }),
        }),
        z.object({ type: z.literal('canceled') }),
        z.object({ type: z.literal('expired') }),
      ]),
    }),
  ),
);

type AnthropicBatchResultLine = InferSchema<
  typeof anthropicBatchResultLineSchema
>;

type AnthropicResponse = InferSchema<typeof anthropicResponseSchema>;

export class AnthropicMessagesBatchLanguageModel
  extends AnthropicLanguageModel
  implements BatchLanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: AnthropicMessagesBatchLanguageModel) {
    return AnthropicLanguageModel[WORKFLOW_SERIALIZE](model);
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: AnthropicModelId;
    config: AnthropicLanguageModelConfig;
  }) {
    return new AnthropicMessagesBatchLanguageModel(
      options.modelId,
      options.config,
    );
  }

  constructor(modelId: AnthropicModelId, config: AnthropicLanguageModelConfig) {
    super(modelId, config);
  }

  async experimental_doStartBatch({
    requests,
    providerOptions,
    headers,
    abortSignal,
    webhookUrl,
  }: Parameters<
    BatchLanguageModelV4['experimental_doStartBatch']
  >[0]): Promise<BatchV4StartResult> {
    validateRequestIds(requests);

    const explicitBatchBetas = new Set(
      await getAnthropicBatchProviderBetas({
        provider: this.config.provider,
        providerOptions,
      }),
    );
    const batchBetas = new Set(explicitBatchBetas);
    const preparedRequests: Array<{
      custom_id: string;
      params: Record<string, unknown>;
    }> = [];
    const batchWarnings: BatchV4StartResult['warnings'] =
      webhookUrl == null
        ? []
        : [
            {
              warning: {
                type: 'unsupported',
                feature: 'webhookUrl',
                details:
                  'The Anthropic Message Batches API does not support completion webhooks.',
              },
            },
          ];

    for (const request of requests) {
      const requestBetas = await getAnthropicBatchProviderBetas({
        provider: this.config.provider,
        providerOptions: request.options.providerOptions,
      });
      if (requestBetas.length > 0) {
        throw new UnsupportedFunctionalityError({
          functionality: 'per-request providerOptions.anthropic.anthropicBeta',
          message:
            `Anthropic Message Batches do not support per-request betas ` +
            `(request "${request.id}"). Set providerOptions.anthropic.anthropicBeta ` +
            `on startTextBatch instead.`,
        });
      }

      const prepared = await this.getArgs({
        ...request.options,
        stream: false,
        userSuppliedBetas: new Set(explicitBatchBetas),
      });
      const body = this.transformRequestBody(prepared.args, prepared.betas);
      validateAnthropicBatchBody({
        body,
        requestId: request.id,
      });

      preparedRequests.push({ custom_id: request.id, params: body });
      for (const beta of prepared.betas) {
        batchBetas.add(beta);
      }
      for (const warning of prepared.warnings) {
        batchWarnings.push({ requestId: request.id, warning });
      }
    }

    const { value: batch } = await postJsonToApi({
      url: this.getBatchUrl(''),
      headers: await this.getStartBatchHeaders({ betas: batchBetas, headers }),
      body: { requests: preparedRequests },
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicBatchResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      batchId: batch.id,
      ...convertAnthropicBatchStatus(batch),
      warnings: batchWarnings,
    };
  }

  async experimental_doGetBatchStatus(
    options: BatchV4OperationOptions,
  ): Promise<BatchV4Status> {
    return convertAnthropicBatchStatus(await this.retrieveBatch(options));
  }

  async experimental_doGetBatchResults(
    options: BatchV4OperationOptions,
  ): Promise<ReadableStream<BatchV4ItemResult<LanguageModelV4GenerateResult>>> {
    const batch = await this.retrieveBatch(options);

    if (convertAnthropicBatchStatus(batch).status === 'pending') {
      throw new InvalidArgumentError({
        argument: 'batchId',
        message: `Anthropic batch "${options.batchId}" is not complete.`,
      });
    }

    if (batch.archived_at != null) {
      throw new InvalidArgumentError({
        argument: 'batchId',
        message: `Anthropic batch "${options.batchId}" results are no longer available.`,
      });
    }

    if (batch.results_url == null) {
      throw new InvalidResponseDataError({
        data: batch,
        message: `Anthropic batch "${options.batchId}" completed without batch output.`,
      });
    }

    const { value: lines } = await getFromApi({
      url: batch.results_url,
      validateUrl: true,
      credentialedOrigin: this.config.baseURL,
      trustedOrigin: this.config.baseURL,
      headers: await this.getBatchHeaders(options.headers),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonLinesResponseHandler(
        anthropicBatchResultLineSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return convertAsyncIteratorToReadableStream(
      this.iterateBatchResults(lines),
    );
  }

  private async retrieveBatch(
    options: BatchV4OperationOptions,
  ): Promise<AnthropicBatchResponse> {
    const { value: batch } = await getFromApi({
      url: this.getBatchUrl(`/${encodeURIComponent(options.batchId)}`),
      validateUrl: false,
      headers: await this.getBatchHeaders(options.headers),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicBatchResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return batch;
  }

  private async *iterateBatchResults(
    lines: AsyncIterable<AnthropicBatchResultLine>,
  ): AsyncGenerator<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
    for await (const line of lines) {
      yield await convertAnthropicBatchResult(line);
    }
  }

  private getBatchUrl(path: string) {
    return `${this.config.baseURL}/messages/batches${path}`;
  }

  private async getStartBatchHeaders({
    betas,
    headers,
  }: {
    betas: Set<string>;
    headers: Record<string, string | undefined> | undefined;
  }) {
    return combineHeaders(
      normalizeHeaders(await this.getBatchHeaders(headers)),
      {
        'anthropic-beta':
          betas.size > 0 ? Array.from(betas).join(',') : undefined,
      },
    );
  }

  private async getBatchHeaders(
    headers: Record<string, string | undefined> | undefined,
  ) {
    return combineHeaders(
      this.config.headers ? await resolve(this.config.headers) : undefined,
      headers,
    );
  }
}

async function getAnthropicBatchProviderBetas({
  provider,
  providerOptions,
}: {
  provider: string;
  providerOptions: BatchV4OperationOptions['providerOptions'];
}) {
  const providerOptionsName = provider.split('.')[0];
  const canonicalOptions = await parseProviderOptions({
    provider: 'anthropic',
    providerOptions,
    schema: anthropicBatchProviderOptionsSchema,
  });
  const customOptions =
    providerOptionsName !== 'anthropic'
      ? await parseProviderOptions({
          provider: providerOptionsName,
          providerOptions,
          schema: anthropicBatchProviderOptionsSchema,
        })
      : undefined;

  const anthropicOptions = Object.assign(
    {},
    canonicalOptions ?? {},
    customOptions ?? {},
  );

  return anthropicOptions.anthropicBeta ?? [];
}

function validateRequestIds(requests: ReadonlyArray<AnthropicBatchRequest>) {
  const ids = new Set<string>();

  for (const request of requests) {
    if (!anthropicBatchRequestIdPattern.test(request.id)) {
      throw new InvalidArgumentError({
        argument: 'requests',
        message:
          `Anthropic batch request ID "${request.id}" must match ` +
          '^[A-Za-z0-9_-]{1,64}$.',
      });
    }

    if (ids.has(request.id)) {
      throw new InvalidArgumentError({
        argument: 'requests',
        message: `Anthropic batch request IDs must be unique; duplicate ID "${request.id}".`,
      });
    }

    ids.add(request.id);
  }
}

function validateAnthropicBatchBody({
  body,
  requestId,
}: {
  body: Record<string, unknown>;
  requestId: string;
}) {
  if (body.speed != null) {
    throw new UnsupportedFunctionalityError({
      functionality: 'providerOptions.anthropic.speed',
      message:
        `Anthropic Message Batches do not support speed ` +
        `(request "${requestId}").`,
    });
  }

  if (
    Array.isArray(body.fallbacks) &&
    body.fallbacks.some(
      fallback =>
        fallback != null &&
        typeof fallback === 'object' &&
        'speed' in fallback &&
        fallback.speed != null,
    )
  ) {
    throw new UnsupportedFunctionalityError({
      functionality: 'providerOptions.anthropic.fallbacks[].speed',
      message:
        `Anthropic Message Batches do not support fallback speed ` +
        `(request "${requestId}").`,
    });
  }
}

function convertAnthropicBatchStatus(
  batch: AnthropicBatchResponse,
): BatchV4Status {
  const requestCounts = convertAnthropicRequestCounts(batch.request_counts);

  return {
    status: mapAnthropicBatchStatus(batch.processing_status),
    rawStatus: batch.processing_status,
    ...(requestCounts != null ? { requestCounts } : {}),
    createdAt: batch.created_at,
    expiresAt: batch.expires_at,
  };
}

function mapAnthropicBatchStatus(rawStatus: string): BatchV4Status['status'] {
  switch (rawStatus) {
    case 'ended':
      return 'completed';
    case 'in_progress':
    case 'canceling':
    default:
      return 'pending';
  }
}

function convertAnthropicRequestCounts(
  counts: AnthropicBatchResponse['request_counts'],
): BatchV4Status['requestCounts'] | undefined {
  return normalizeBatchRequestCounts({
    total:
      counts.processing +
      counts.succeeded +
      counts.errored +
      counts.canceled +
      counts.expired,
    pending: counts.processing,
    completed: counts.succeeded,
    failed: counts.errored + counts.canceled + counts.expired,
  });
}

async function convertAnthropicBatchResult(
  line: AnthropicBatchResultLine,
): Promise<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
  switch (line.result.type) {
    case 'canceled':
      return { id: line.custom_id, status: 'cancelled' };
    case 'expired':
      return { id: line.custom_id, status: 'expired' };
    case 'errored': {
      const requestId = line.result.error.request_id;
      return {
        id: line.custom_id,
        status: 'failed',
        error: {
          message: line.result.error.error.message,
          type: line.result.error.error.type,
        },
        ...(requestId != null
          ? {
              providerMetadata: {
                anthropic: { requestId },
              } satisfies SharedV4ProviderMetadata,
            }
          : {}),
      };
    }
    case 'succeeded': {
      const validation = await safeValidateTypes({
        value: line.result.message,
        schema: anthropicResponseSchema,
      });

      if (!validation.success) {
        return {
          id: line.custom_id,
          status: 'failed',
          error: {
            message: 'Anthropic returned an invalid Message batch result.',
            code: 'invalid_response',
          },
        };
      }

      const response = validation.value;

      const unsupportedPart = response.content.find(
        part => !supportedBatchContentTypes.has(part.type),
      );

      if (unsupportedPart != null) {
        return {
          id: line.custom_id,
          status: 'failed',
          error: {
            message:
              `Anthropic returned a "${unsupportedPart.type}" content block, ` +
              'but tool content is not supported in AI SDK text batches.',
            code: 'unsupported_content',
          },
        };
      }

      return {
        id: line.custom_id,
        status: 'succeeded',
        result: convertAnthropicBatchResponse(response),
      };
    }
  }
}

const supportedBatchContentTypes = new Set([
  'text',
  'thinking',
  'redacted_thinking',
  'compaction',
  // The normal Anthropic response conversion intentionally drops this marker;
  // the fallback hop remains available through usage.iterations metadata.
  'fallback',
]);

function convertAnthropicBatchResponse(
  response: AnthropicResponse,
): LanguageModelV4GenerateResult {
  const content: LanguageModelV4GenerateResult['content'] = [];

  for (const part of response.content) {
    switch (part.type) {
      case 'text':
        content.push({ type: 'text', text: part.text });
        break;
      case 'thinking':
        content.push({
          type: 'reasoning',
          text: part.thinking,
          providerMetadata: {
            anthropic: {
              signature: part.signature,
            } satisfies AnthropicReasoningMetadata,
          },
        });
        break;
      case 'redacted_thinking':
        content.push({
          type: 'reasoning',
          text: '',
          providerMetadata: {
            anthropic: {
              redactedData: part.data,
            } satisfies AnthropicReasoningMetadata,
          },
        });
        break;
      case 'compaction':
        content.push({
          type: 'text',
          text: part.content,
          providerMetadata: { anthropic: { type: 'compaction' } },
        });
        break;
    }
  }

  return {
    content,
    finishReason: {
      unified: mapAnthropicStopReason({
        finishReason: response.stop_reason,
      }),
      raw: response.stop_reason ?? undefined,
    },
    usage: convertAnthropicUsage({ usage: response.usage }),
    response: {
      id: response.id ?? undefined,
      modelId: response.model ?? undefined,
    },
    warnings: [],
    providerMetadata: {
      anthropic: convertAnthropicMessageMetadata(response),
    },
  };
}

function convertAnthropicMessageMetadata(response: AnthropicResponse) {
  const stopDetails = mapAnthropicStopDetails(response.stop_details);

  return {
    usage: response.usage as JSONObject,
    stopSequence: response.stop_sequence ?? null,
    ...(stopDetails != null ? { stopDetails } : {}),
    iterations: response.usage.iterations
      ? response.usage.iterations.map(
          iteration =>
            ({
              type: iteration.type,
              ...(iteration.model != null ? { model: iteration.model } : {}),
              inputTokens: iteration.input_tokens,
              outputTokens: iteration.output_tokens,
              ...(iteration.cache_creation_input_tokens
                ? {
                    cacheCreationInputTokens:
                      iteration.cache_creation_input_tokens,
                  }
                : {}),
              ...(iteration.cache_read_input_tokens
                ? { cacheReadInputTokens: iteration.cache_read_input_tokens }
                : {}),
            }) satisfies AnthropicUsageIteration,
        )
      : null,
    container: response.container
      ? {
          expiresAt: response.container.expires_at,
          id: response.container.id,
          skills:
            response.container.skills?.map(skill => ({
              type: skill.type,
              skillId: skill.skill_id,
              version: skill.version,
            })) ?? null,
        }
      : null,
    contextManagement: mapAnthropicResponseContextManagement(
      response.context_management,
    ),
  } satisfies AnthropicMessageMetadata;
}

function mapAnthropicResponseContextManagement(
  contextManagement: AnthropicResponseContextManagement | null | undefined,
): AnthropicMessageMetadata['contextManagement'] {
  return contextManagement
    ? {
        appliedEdits: contextManagement.applied_edits.map(edit => {
          switch (edit.type) {
            case 'clear_tool_uses_20250919':
              return {
                type: edit.type,
                clearedToolUses: edit.cleared_tool_uses,
                clearedInputTokens: edit.cleared_input_tokens,
              };
            case 'clear_thinking_20251015':
              return {
                type: edit.type,
                clearedThinkingTurns: edit.cleared_thinking_turns,
                clearedInputTokens: edit.cleared_input_tokens,
              };
            case 'compact_20260112':
              return { type: edit.type };
          }
        }),
      }
    : null;
}

function mapAnthropicStopDetails(
  stopDetails: AnthropicStopDetails | null | undefined,
): AnthropicMessageMetadata['stopDetails'] | undefined {
  if (stopDetails == null) {
    return undefined;
  }

  return {
    type: stopDetails.type,
    ...(stopDetails.category != null ? { category: stopDetails.category } : {}),
    ...(stopDetails.explanation != null
      ? { explanation: stopDetails.explanation }
      : {}),
    ...(stopDetails.recommended_model != null
      ? { recommendedModel: stopDetails.recommended_model }
      : {}),
  };
}
