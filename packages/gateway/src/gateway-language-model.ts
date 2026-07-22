import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  SharedV4Warning,
  LanguageModelV4FilePart,
  LanguageModelV4StreamPart,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
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

export class GatewayLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly supportedUrls = { '*/*': [/.*/] };

  constructor(
    readonly modelId: GatewayModelId,
    private readonly config: GatewayChatConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs(options: LanguageModelV4CallOptions) {
    const { abortSignal: _abortSignal, ...optionsWithoutSignal } = options;
    const warnings: SharedV4Warning[] = [];

    // When gateway.order or gateway.only restrict which providers may be used,
    // also enforce that restriction on gateway.models so that fallback models
    // whose provider prefix is not in the allowed set are silently dropped and
    // surfaced as warnings instead of routing to unexpected providers.
    const gatewayOptions = optionsWithoutSignal.providerOptions?.['gateway'];
    if (gatewayOptions) {
      const order = Array.isArray(gatewayOptions['order'])
        ? (gatewayOptions['order'] as string[])
        : undefined;
      const only = Array.isArray(gatewayOptions['only'])
        ? (gatewayOptions['only'] as string[])
        : undefined;
      const models = Array.isArray(gatewayOptions['models'])
        ? (gatewayOptions['models'] as string[])
        : undefined;

      if (models && (order || only)) {
        const allowedProviders = new Set([...(order ?? []), ...(only ?? [])]);
        const keptModels: string[] = [];
        const removedModels: string[] = [];

        for (const modelId of models) {
          const providerPrefix = modelId.split('/')[0];
          if (allowedProviders.has(providerPrefix)) {
            keptModels.push(modelId);
          } else {
            removedModels.push(modelId);
          }
        }

        if (removedModels.length > 0) {
          const allowedList = [...allowedProviders].join(', ');
          for (const modelId of removedModels) {
            warnings.push({
              type: 'other',
              message: `Model "${modelId}" was removed from gateway.models because its provider is not in the allowed provider list (${allowedList}).`,
            });
          }

          optionsWithoutSignal.providerOptions = {
            ...optionsWithoutSignal.providerOptions,
            gateway: {
              ...gatewayOptions,
              models: keptModels,
            },
          };
        }
      }
    }

    return {
      args: this.maybeEncodeFileParts(optionsWithoutSignal),
      warnings,
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, warnings } = await this.getArgs(options);
    const { abortSignal } = options;

    const resolvedHeaders = await resolve(this.config.headers());

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
          errorToMessage: data => data,
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
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
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
  private maybeEncodeFileParts(options: LanguageModelV4CallOptions) {
    for (const message of options.prompt) {
      for (const part of message.content) {
        if (this.isFilePart(part)) {
          const filePart = part as LanguageModelV4FilePart;
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
      'ai-language-model-specification-version': '4',
      'ai-language-model-id': modelId,
      'ai-language-model-streaming': String(streaming),
    };
  }
}
