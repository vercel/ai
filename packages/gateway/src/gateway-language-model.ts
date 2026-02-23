import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FilePart,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  type ParseResult,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { GatewayConfig } from './gateway-config';
import type { GatewayModelId } from './gateway-language-model-settings';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';

type GatewayChatConfig = GatewayConfig & {
  provider: string;
  o11yHeaders: Resolvable<Record<string, string>>;
};

export class GatewayLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3';
  readonly supportedUrls = { '*/*': [/.*/] };

  constructor(
    readonly modelId: GatewayModelId,
    private readonly config: GatewayChatConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs(options: LanguageModelV3CallOptions) {
    const { abortSignal: _abortSignal, ...optionsWithoutSignal } = options;

    return {
      args: this.maybeEncodeFileParts(optionsWithoutSignal),
      warnings: [],
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { args, warnings } = await this.getArgs(options);
    const { abortSignal } = options;

    const resolvedHeaders = await resolve(this.config.headers());

    try {
      const {
        responseHeaders,
        value,
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
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      const { usage, ...responseBody } = value as {
        content: LanguageModelV3GenerateResult['content'];
        finishReason: LanguageModelV3GenerateResult['finishReason'];
        usage?: unknown;
        providerMetadata?: LanguageModelV3GenerateResult['providerMetadata'];
      };

      return {
        ...responseBody,
        usage: normalizeGatewayUsageToV3(usage),
        request: { body: args },
        response: { headers: responseHeaders, body: rawResponse },
        warnings,
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { args, warnings } = await this.getArgs(options);
    const { abortSignal } = options;

    const resolvedHeaders = await resolve(this.config.headers());

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
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        stream: response.pipeThrough(
          new TransformStream<
            ParseResult<LanguageModelV3StreamPart>,
            LanguageModelV3StreamPart
          >({
            start(controller) {
              if (warnings.length > 0) {
                controller.enqueue({ type: 'stream-start', warnings });
              }
            },
            transform(chunk, controller) {
              if (chunk.success) {
                const streamPart = chunk.value as LanguageModelV3StreamPart;

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

                if (streamPart.type === 'finish' && streamPart.usage != null) {
                  (
                    streamPart as LanguageModelV3StreamPart & {
                      usage: LanguageModelV3Usage;
                    }
                  ).usage = normalizeGatewayUsageToV3(streamPart.usage);
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
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }

  private isFilePart(part: unknown) {
    return (
      part && typeof part === 'object' && 'type' in part && part.type === 'file'
    );
  }

  /**
   * Encodes file parts in the prompt to base64. Mutates the passed options
   * instance directly to avoid copying the file data.
   * @param options - The options to encode.
   * @returns The options with the file parts encoded.
   */
  private maybeEncodeFileParts(options: LanguageModelV3CallOptions) {
    for (const message of options.prompt) {
      for (const part of message.content) {
        if (this.isFilePart(part)) {
          const filePart = part as LanguageModelV3FilePart;
          // If the file part is a URL it will get cleanly converted to a string.
          // If it's a binary file attachment we convert it to a data url.
          // In either case, server-side we should only ever see URLs as strings.
          if (filePart.data instanceof Uint8Array) {
            const buffer = Uint8Array.from(filePart.data);
            const base64Data = Buffer.from(buffer).toString('base64');
            filePart.data = new URL(
              `data:${filePart.mediaType || 'application/octet-stream'};base64,${base64Data}`,
            );
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
      'ai-language-model-specification-version': '3',
      'ai-language-model-id': modelId,
      'ai-language-model-streaming': String(streaming),
    };
  }
}

function normalizeGatewayUsageToV3(usage: unknown): LanguageModelV3Usage {
  const candidate = usage as
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
      }
    | {
        inputTokens?: {
          total?: number;
          noCache?: number;
          cacheRead?: number;
          cacheWrite?: number;
        };
        outputTokens?: {
          total?: number;
          text?: number;
          reasoning?: number;
        };
      }
    | LanguageModelV3Usage
    | undefined;
  // if the object is already v3
  if (
    candidate &&
    typeof candidate === 'object' &&
    candidate.inputTokens &&
    typeof candidate.inputTokens === 'object' &&
    (candidate.inputTokens as { total?: number }).total !== undefined
  ) {
    return candidate as LanguageModelV3Usage;
  }

  // if the object is v2, we need to flatten it to v3
  const flatInputTokens =
    typeof candidate?.inputTokens === 'number'
      ? candidate.inputTokens
      : undefined;
  const flatOutputTokens =
    typeof candidate?.outputTokens === 'number'
      ? candidate.outputTokens
      : undefined;
  const flatReasoningTokens =
    typeof (candidate as { reasoningTokens?: number })?.reasoningTokens ===
    'number'
      ? (candidate as { reasoningTokens?: number }).reasoningTokens
      : undefined;
  const flatCachedInputTokens =
    typeof (candidate as { cachedInputTokens?: number })?.cachedInputTokens ===
    'number'
      ? (candidate as { cachedInputTokens?: number }).cachedInputTokens
      : undefined;

  if (
    flatInputTokens !== undefined ||
    flatOutputTokens !== undefined ||
    flatReasoningTokens !== undefined ||
    flatCachedInputTokens !== undefined
  ) {
    return {
      inputTokens: {
        total: flatInputTokens,
        noCache: undefined,
        cacheRead: flatCachedInputTokens,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: flatOutputTokens,
        text: undefined,
        reasoning: flatReasoningTokens,
      },
      raw: usage as LanguageModelV3Usage['raw'],
    };
  }

  // otherwise, we return an empty v3 object
  return {
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
    raw: usage as LanguageModelV3Usage['raw'],
  };
}
