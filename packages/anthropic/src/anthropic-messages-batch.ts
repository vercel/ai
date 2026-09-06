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
  isRecord,
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
  createCitationSource,
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
      cancel_initiated_at: z.string().nullish(),
      ended_at: z.string().nullish(),
      results_url: z.string().nullish(),
    }),
  ),
);

type AnthropicBatchResponse = InferSchema<typeof anthropicBatchResponseSchema>;

const knownAnthropicBatchContentTypes = new Set([
  'advisor_tool_result',
  'bash_code_execution_tool_result',
  'code_execution_tool_result',
  'compaction',
  'container_upload',
  'fallback',
  'mcp_tool_result',
  'mcp_tool_use',
  'redacted_thinking',
  'server_tool_use',
  'text',
  'text_editor_code_execution_tool_result',
  'thinking',
  'tool_search_tool_result',
  'tool_use',
  'web_fetch_tool_result',
  'web_search_tool_result',
]);

const anthropicBatchResultSchema = lazySchema(() =>
  zodSchema(
    z.discriminatedUnion('type', [
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
  ),
);

const anthropicBatchResultLineSchema = lazySchema(() =>
  zodSchema(
    z.object({
      custom_id: z.string(),
      result: z.unknown(),
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
      if (prepared.usesJsonResponseTool) {
        throw new UnsupportedFunctionalityError({
          functionality: 'batch responseFormat JSON-tool fallback',
          message:
            `Anthropic Message Batches cannot decode the JSON-tool structured-output fallback ` +
            `(request "${request.id}") because batch results are retrieved independently of the start call. ` +
            `Use a model that supports native output_format structured outputs.`,
        });
      }
      const aliasedProviderTool = request.options.tools?.find(
        tool =>
          tool.type === 'provider' &&
          prepared.toolNameMapping.toProviderToolName(tool.name) !== tool.name,
      );
      if (aliasedProviderTool != null) {
        throw new UnsupportedFunctionalityError({
          functionality: 'aliased provider tool names in batches',
          message:
            `Anthropic Message Batches cannot restore the custom provider-tool name ` +
            `"${aliasedProviderTool.name}" when results are retrieved independently of the start call ` +
            `(request "${request.id}"). Use the provider's canonical tool name.`,
        });
      }
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
      yield await convertAnthropicBatchResult(line, this.generateId);
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
    providerMetadata: {
      anthropic: {
        archivedAt: batch.archived_at ?? null,
        cancelInitiatedAt: batch.cancel_initiated_at ?? null,
        endedAt: batch.ended_at ?? null,
        requestCounts: batch.request_counts,
        resultsUrl: batch.results_url ?? null,
      },
    },
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
  generateId: () => string,
): Promise<BatchV4ItemResult<LanguageModelV4GenerateResult>> {
  const resultValidation = await safeValidateTypes({
    value: line.result,
    schema: anthropicBatchResultSchema,
  });

  if (!resultValidation.success) {
    return invalidAnthropicBatchResult(line.custom_id);
  }

  const result = resultValidation.value;

  switch (result.type) {
    case 'canceled':
      return { id: line.custom_id, status: 'cancelled' };
    case 'expired':
      return { id: line.custom_id, status: 'expired' };
    case 'errored': {
      const requestId = result.error.request_id;
      return {
        id: line.custom_id,
        status: 'failed',
        error: {
          message: result.error.error.message,
          type: result.error.error.type,
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
      const response = await parseAnthropicBatchResponse(result.message);

      if (response == null) {
        return invalidAnthropicBatchResult(line.custom_id);
      }

      return {
        id: line.custom_id,
        status: 'succeeded',
        result: convertAnthropicBatchResponse(response, generateId),
      };
    }
  }
}

function invalidAnthropicBatchResult(
  id: string,
): BatchV4ItemResult<LanguageModelV4GenerateResult> {
  return {
    id,
    status: 'failed',
    error: {
      message: 'Anthropic returned an invalid Message batch result.',
      code: 'invalid_response',
    },
  };
}

async function parseAnthropicBatchResponse(
  message: unknown,
): Promise<AnthropicResponse | undefined> {
  const validation = await safeValidateTypes({
    value: message,
    schema: anthropicResponseSchema,
  });

  if (validation.success) {
    return validation.value;
  }

  if (!isRecord(message) || !Array.isArray(message.content)) {
    return undefined;
  }

  const content: AnthropicResponse['content'] = [];
  for (const part of message.content) {
    const partValidation = await safeValidateTypes({
      value: { ...message, content: [part] },
      schema: anthropicResponseSchema,
    });

    if (partValidation.success) {
      const [validatedPart] = partValidation.value.content;
      if (validatedPart != null) {
        content.push(validatedPart);
      }
    } else if (
      !isRecord(part) ||
      typeof part.type !== 'string' ||
      knownAnthropicBatchContentTypes.has(part.type)
    ) {
      return undefined;
    }
  }

  const recovered = await safeValidateTypes({
    value: { ...message, content },
    schema: anthropicResponseSchema,
  });

  return recovered.success ? recovered.value : undefined;
}

function convertAnthropicBatchResponse(
  response: AnthropicResponse,
  generateId: () => string,
): LanguageModelV4GenerateResult {
  const content: LanguageModelV4GenerateResult['content'] = [];
  const mcpToolCalls: Record<
    string,
    Extract<
      LanguageModelV4GenerateResult['content'][number],
      { type: 'tool-call' }
    >
  > = {};
  const serverToolCalls: Record<string, string> = {};

  for (const part of response.content) {
    switch (part.type) {
      case 'text':
        const citations = part.citations;

        content.push({
          type: 'text',
          text: part.text,
          ...(citations != null &&
            citations.length > 0 && {
              providerMetadata: {
                anthropic: { citations },
              },
            }),
        });
        for (const citation of part.citations ?? []) {
          // Batch result retrieval does not include the original prompt's
          // document ordering, so indexed document citations cannot be
          // normalized safely. Preserve them above as provider metadata.
          const source = createCitationSource(citation, [], generateId);
          if (source != null) {
            content.push(source);
          }
        }
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
      case 'container_upload':
        content.push({
          type: 'custom',
          kind: 'anthropic.container_upload',
          providerMetadata: { anthropic: { fileId: part.file_id } },
        });
        break;
      case 'compaction':
        content.push({
          type: 'text',
          text: part.content,
          providerMetadata: { anthropic: { type: 'compaction' } },
        });
        break;
      case 'tool_use':
        content.push({
          type: 'tool-call',
          toolCallId: part.id,
          toolName: part.name,
          input: JSON.stringify(part.input),
          ...anthropicCallerMetadata(part.caller),
        });
        break;
      case 'server_tool_use': {
        const isCodeExecutionAlias =
          part.name === 'bash_code_execution' ||
          part.name === 'text_editor_code_execution';
        const isCodeExecution =
          isCodeExecutionAlias || part.name === 'code_execution';
        const toolName = isCodeExecutionAlias ? 'code_execution' : part.name;
        if (
          part.name === 'tool_search_tool_bm25' ||
          part.name === 'tool_search_tool_regex'
        ) {
          serverToolCalls[part.id] = part.name;
        }
        content.push({
          type: 'tool-call',
          toolCallId: part.id,
          toolName,
          input: JSON.stringify(
            isCodeExecutionAlias
              ? { type: part.name, ...(part.input ?? {}) }
              : part.name === 'code_execution' &&
                  part.input != null &&
                  'code' in part.input &&
                  !('type' in part.input)
                ? { type: 'programmatic-tool-call', ...part.input }
                : part.input,
          ),
          providerExecuted: true,
          // Batch results are retrieved without the original request tools, so
          // implicitly provisioned code execution must remain self-describing.
          ...(isCodeExecution ? { dynamic: true } : {}),
          ...anthropicCallerMetadata(part.caller),
        });
        break;
      }
      case 'mcp_tool_use': {
        const toolCall = {
          type: 'tool-call' as const,
          toolCallId: part.id,
          toolName: part.name,
          input: JSON.stringify(part.input),
          providerExecuted: true,
          dynamic: true,
          providerMetadata: {
            anthropic: {
              serverName: part.server_name,
              type: 'mcp-tool-use',
            },
          },
        };
        mcpToolCalls[part.id] = toolCall;
        content.push(toolCall);
        break;
      }
      case 'mcp_tool_result': {
        const toolCall = mcpToolCalls[part.tool_use_id];
        content.push({
          type: 'tool-result',
          toolCallId: part.tool_use_id,
          toolName: toolCall?.toolName ?? 'mcp',
          isError: part.is_error,
          result: part.content,
          dynamic: true,
          ...(toolCall?.providerMetadata != null && {
            providerMetadata: toolCall.providerMetadata,
          }),
        });
        break;
      }
      case 'web_fetch_tool_result':
        content.push({
          type: 'tool-result',
          toolCallId: part.tool_use_id,
          toolName: 'web_fetch',
          ...(part.content.type === 'web_fetch_tool_result_error'
            ? {
                isError: true,
                result: {
                  errorCode: part.content.error_code,
                  type: part.content.type,
                },
              }
            : {
                result: {
                  content: {
                    citations: part.content.content.citations,
                    source: {
                      data: part.content.content.source.data,
                      mediaType: part.content.content.source.media_type,
                      type: part.content.content.source.type,
                    },
                    title: part.content.content.title,
                    type: part.content.content.type,
                  },
                  retrievedAt: part.content.retrieved_at,
                  type: part.content.type,
                  url: part.content.url,
                },
              }),
          ...anthropicCallerMetadata(part.caller),
        });
        break;
      case 'web_search_tool_result':
        content.push({
          type: 'tool-result',
          toolCallId: part.tool_use_id,
          toolName: 'web_search',
          ...(Array.isArray(part.content)
            ? {
                result: part.content.map(result => ({
                  encryptedContent: result.encrypted_content,
                  pageAge: result.page_age ?? null,
                  ...(result.title != null ? { title: result.title } : {}),
                  type: result.type,
                  url: result.url,
                })),
              }
            : {
                isError: true,
                result: {
                  errorCode: part.content.error_code,
                  type: part.content.type,
                },
              }),
          ...anthropicCallerMetadata(part.caller),
        });
        if (Array.isArray(part.content)) {
          for (const result of part.content) {
            content.push({
              type: 'source',
              sourceType: 'url',
              id: generateId(),
              url: result.url,
              ...(result.title != null ? { title: result.title } : {}),
              providerMetadata: {
                anthropic: {
                  pageAge: result.page_age ?? null,
                },
              },
            });
          }
        }
        break;
      case 'code_execution_tool_result':
        content.push({
          type: 'tool-result',
          toolCallId: part.tool_use_id,
          toolName: 'code_execution',
          ...(part.content.type === 'code_execution_tool_result_error'
            ? {
                isError: true,
                result: {
                  errorCode: part.content.error_code,
                  type: part.content.type,
                },
              }
            : { result: part.content }),
        });
        break;
      case 'bash_code_execution_tool_result':
      case 'text_editor_code_execution_tool_result':
        content.push({
          type: 'tool-result',
          toolCallId: part.tool_use_id,
          toolName: 'code_execution',
          result: part.content,
        });
        break;
      case 'tool_search_tool_result': {
        const toolName =
          serverToolCalls[part.tool_use_id] ?? 'tool_search_tool_regex';
        content.push({
          type: 'tool-result',
          toolCallId: part.tool_use_id,
          toolName,
          ...(part.content.type === 'tool_search_tool_result_error'
            ? {
                isError: true,
                result: {
                  errorCode: part.content.error_code,
                  type: part.content.type,
                },
              }
            : {
                result: part.content.tool_references.map(reference => ({
                  toolName: reference.tool_name,
                  type: reference.type,
                })),
              }),
        });
        break;
      }
      case 'advisor_tool_result':
        if (part.content.type === 'advisor_result') {
          content.push({
            type: 'tool-result',
            toolCallId: part.tool_use_id,
            toolName: 'advisor',
            result: {
              type: part.content.type,
              text: part.content.text,
              ...(part.content.stop_reason != null
                ? { stopReason: part.content.stop_reason }
                : {}),
            },
          });
        } else if (part.content.type === 'advisor_redacted_result') {
          content.push({
            type: 'tool-result',
            toolCallId: part.tool_use_id,
            toolName: 'advisor',
            result: {
              type: part.content.type,
              encryptedContent: part.content.encrypted_content,
              ...(part.content.stop_reason != null
                ? { stopReason: part.content.stop_reason }
                : {}),
            },
          });
        } else {
          content.push({
            type: 'tool-result',
            toolCallId: part.tool_use_id,
            toolName: 'advisor',
            isError: true,
            result: {
              errorCode: part.content.error_code,
              type: part.content.type,
            },
          });
        }
        break;
      case 'fallback':
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

function anthropicCallerMetadata(
  caller: { type: string; tool_id?: string } | null | undefined,
) {
  return caller == null
    ? {}
    : {
        providerMetadata: {
          anthropic: {
            caller: {
              type: caller.type,
              toolId: caller.tool_id,
            },
          },
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
