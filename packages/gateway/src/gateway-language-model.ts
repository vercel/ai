import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4ResponseMetadata,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
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

export type GatewayChatConfig = GatewayConfig & {
  provider: string;
  o11yHeaders: Resolvable<Record<string, string>>;
};

export class GatewayLanguageModel implements LanguageModelV4 {
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
    protected readonly config: GatewayChatConfig,
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

    const isAnthropic = this.modelId.startsWith('anthropic/');
    const exceeds21k =
      options.maxOutputTokens != null && options.maxOutputTokens > 21333;

    if (isAnthropic && exceeds21k) {
      return await this.generateResultFromStream(
        options,
        [
          {
            type: 'compatibility',
            feature: 'maxOutputTokens',
            details:
              'Non-streaming request exceeds gateway limit of 21,333 tokens; completed via streaming fallback.',
          },
          ...warnings,
        ],
        resolvedHeaders,
      );
    }

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
        warnings: [...(responseBody.warnings ?? []), ...warnings],
      };
    } catch (error) {
      if (isUnder21kError(error)) {
        return await this.generateResultFromStream(
          options,
          [
            {
              type: 'compatibility',
              feature: 'maxOutputTokens',
              details:
                'Non-streaming request rejected by gateway (exceeds 21,333 token limit); completed via streaming fallback.',
            },
            ...warnings,
          ],
          resolvedHeaders,
        );
      }

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
   * Encodes inline `Uint8Array` file data to a base64 string in place.
   * @param options - The options to encode.
   * @returns The options with the file data encoded.
   */
  protected maybeEncodeFileParts<
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

  private getModelConfigHeaders(modelId: string, streaming: boolean) {
    return {
      'ai-language-model-specification-version': '4',
      'ai-language-model-id': modelId,
      'ai-language-model-streaming': String(streaming),
    };
  }

  private async generateResultFromStream(
    options: LanguageModelV4CallOptions,
    fallbackWarnings: Array<SharedV4Warning> = [],
    resolvedHeaders?: Record<string, string | undefined>,
  ): Promise<LanguageModelV4GenerateResult> {
    try {
      const streamResult = await this.doStream(options);
      const reader = streamResult.stream.getReader();
      const content: Array<LanguageModelV4Content> = [];
      const warnings: Array<SharedV4Warning> = [...fallbackWarnings];
      let finishReason: LanguageModelV4FinishReason = {
        unified: 'other',
        raw: undefined,
      };
      let usage: LanguageModelV4Usage = {
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: undefined,
          text: undefined,
          reasoning: undefined,
        },
      };
      let providerMetadata: SharedV4ProviderMetadata | undefined;
      let responseMetadata: LanguageModelV4ResponseMetadata | undefined;

      const toolCallsById = new Map<
        string,
        {
          type: 'tool-call';
          toolCallId: string;
          toolName: string;
          input: string;
          providerMetadata?: SharedV4ProviderMetadata;
        }
      >();

      try {
        while (true) {
          const { done, value: part } = await reader.read();
          if (done) break;

          switch (part.type) {
            case 'stream-start': {
              warnings.push(...part.warnings);
              break;
            }
            case 'response-metadata': {
              responseMetadata = {
                id: part.id,
                modelId: part.modelId,
                timestamp: part.timestamp,
              };
              break;
            }
            case 'text-delta': {
              const delta =
                (part as { textDelta?: string }).textDelta ??
                (part as { delta?: string }).delta ??
                '';
              const last = content[content.length - 1];
              if (last && last.type === 'text') {
                last.text += delta;
                if (part.providerMetadata) {
                  last.providerMetadata = {
                    ...last.providerMetadata,
                    ...part.providerMetadata,
                  };
                }
              } else {
                content.push({
                  type: 'text',
                  text: delta,
                  ...(part.providerMetadata && {
                    providerMetadata: part.providerMetadata,
                  }),
                });
              }
              break;
            }
            case 'reasoning-delta': {
              const delta =
                (part as { textDelta?: string }).textDelta ??
                (part as { delta?: string }).delta ??
                '';
              const last = content[content.length - 1];
              if (last && last.type === 'reasoning') {
                last.text += delta;
                if (part.providerMetadata) {
                  last.providerMetadata = {
                    ...last.providerMetadata,
                    ...part.providerMetadata,
                  };
                }
              } else {
                content.push({
                  type: 'reasoning',
                  text: delta,
                  ...(part.providerMetadata && {
                    providerMetadata: part.providerMetadata,
                  }),
                });
              }
              break;
            }
            case 'tool-call': {
              content.push(part);
              break;
            }
            case 'tool-input-start': {
              const toolCall: {
                type: 'tool-call';
                toolCallId: string;
                toolName: string;
                input: string;
                providerMetadata?: SharedV4ProviderMetadata;
              } = {
                type: 'tool-call',
                toolCallId: part.id,
                toolName: part.toolName,
                input: '',
                ...(part.providerMetadata && {
                  providerMetadata: part.providerMetadata,
                }),
              };
              toolCallsById.set(part.id, toolCall);
              content.push(toolCall);
              break;
            }
            case 'tool-input-delta': {
              const toolCall = toolCallsById.get(part.id);
              if (toolCall) {
                toolCall.input += part.delta;
              }
              break;
            }
            case 'tool-result':
            case 'file':
            case 'reasoning-file':
            case 'source':
            case 'custom':
            case 'tool-approval-request': {
              content.push(part);
              break;
            }
            case 'finish': {
              finishReason = normalizeFinishReason(
                part.finishReason ??
                  (part as { finish_reason?: unknown }).finish_reason,
              );
              usage = normalizeUsage(part.usage);
              if (part.providerMetadata) {
                providerMetadata = part.providerMetadata;
              }
              break;
            }
            case 'error': {
              throw part.error;
            }
            default:
              break;
          }
        }
      } finally {
        reader.releaseLock();
      }

      return {
        content,
        finishReason,
        usage,
        warnings,
        request: streamResult.request,
        response: {
          ...responseMetadata,
          headers: streamResult.response?.headers,
        },
        ...(providerMetadata && { providerMetadata }),
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }
}

function isUnder21kError(error: unknown): boolean {
  if (error == null) return false;
  const messages: string[] = [];

  if (typeof error === 'string') {
    messages.push(error);
  } else if (typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.message === 'string') {
      messages.push(err.message);
    }
    if (typeof err.responseBody === 'string') {
      messages.push(err.responseBody);
    }
    if (err.data && typeof err.data === 'object') {
      try {
        messages.push(JSON.stringify(err.data));
      } catch {
        // ignore
      }
    }
    if (err.cause != null) {
      if (typeof err.cause === 'string') {
        messages.push(err.cause);
      } else if (typeof err.cause === 'object') {
        const cause = err.cause as Record<string, unknown>;
        if (typeof cause.message === 'string') {
          messages.push(cause.message);
        }
        if (typeof cause.responseBody === 'string') {
          messages.push(cause.responseBody);
        }
      }
    }
  }

  return messages.some(msg => /under 21k|21,?333/i.test(msg));
}

function normalizeFinishReason(raw: unknown): LanguageModelV4FinishReason {
  if (typeof raw === 'object' && raw !== null && 'unified' in raw) {
    return raw as LanguageModelV4FinishReason;
  }
  const rawString = typeof raw === 'string' ? raw : undefined;
  switch (rawString) {
    case 'stop':
    case 'length':
    case 'content-filter':
    case 'tool-calls':
    case 'error':
    case 'other':
      return { unified: rawString, raw: rawString };
    default:
      return { unified: 'other', raw: rawString };
  }
}

function normalizeUsage(rawUsage: any): LanguageModelV4Usage {
  if (
    rawUsage &&
    typeof rawUsage === 'object' &&
    'inputTokens' in rawUsage &&
    'outputTokens' in rawUsage
  ) {
    return rawUsage as LanguageModelV4Usage;
  }
  const promptTokens =
    rawUsage?.promptTokens ??
    rawUsage?.prompt_tokens ??
    rawUsage?.inputTokens ??
    undefined;
  const completionTokens =
    rawUsage?.completionTokens ??
    rawUsage?.completion_tokens ??
    rawUsage?.outputTokens ??
    undefined;

  return {
    inputTokens: {
      total: promptTokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: completionTokens,
      reasoning: undefined,
    },
    raw: rawUsage,
  };
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
