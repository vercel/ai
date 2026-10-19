import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
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

/**
 * The gateway server can send the final `finish` part in the older v2 shape
 * (string `finishReason`, flat usage) even when the client requested
 * specification version 4 (#23533). ai@7 reads `finishReason.unified` to decide
 * whether queued tool calls may run, so an unnormalized part silently disables
 * tool execution through the gateway.
 */
const V2_FINISH_REASONS = new Set([
  'stop',
  'length',
  'content-filter',
  'tool-calls',
  'error',
]);

function normalizeLegacyFinishPart(streamPart: any): any {
  if (
    streamPart?.type !== 'finish' ||
    typeof streamPart.finishReason !== 'string'
  ) {
    return streamPart;
  }
  const raw = streamPart.finishReason;
  const usage = streamPart.usage;
  return {
    ...streamPart,
    finishReason: {
      unified: V2_FINISH_REASONS.has(raw) ? raw : 'other',
      raw,
    },
    usage: normalizeLegacyUsage(usage),
  };
}

function normalizeLegacyUsage(usage: any): any {
  if (usage == null || typeof usage !== 'object') {
    return usage;
  }
  // Already the v4 nested shape.
  if (usage.inputTokens?.total !== undefined) {
    return usage;
  }
  const flat: Record<string, number | undefined> = usage;
  const inputTokens: number | undefined =
    flat.inputTokens ?? flat.prompt_tokens ?? flat.totalTokens;
  const outputTokens: number | undefined =
    flat.outputTokens ?? flat.completion_tokens;
  const cached: number | undefined =
    flat.cachedInputTokens ?? flat.cached_input_tokens;
  const hasAny =
    inputTokens !== undefined ||
    outputTokens !== undefined ||
    cached !== undefined;
  if (!hasAny) {
    return usage;
  }
  return {
    inputTokens: {
      ...(inputTokens !== undefined ? { total: inputTokens } : {}),
      ...(cached !== undefined ? { cacheRead: cached } : {}),
    },
    ...(outputTokens !== undefined
      ? { outputTokens: { total: outputTokens } }
      : {}),
    ...(Object.keys(usage).length > 0 ? { raw: usage } : {}),
  };
}

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

                controller.enqueue(
                  normalizeLegacyFinishPart(
                    streamPart,
                  ) as LanguageModelV4StreamPart,
                );
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
