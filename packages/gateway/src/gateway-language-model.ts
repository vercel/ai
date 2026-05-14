import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FilePart,
  LanguageModelV4Message,
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
  resolveFullMediaType,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
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

/**
 * File part shape that the AI Gateway server actually accepts on the wire:
 * the V3-style untagged `data` (a `Uint8Array`, base64 string, or `URL`),
 * instead of the V4 tagged discriminated union.
 */
type GatewayLanguageModelV4FilePart = Omit<LanguageModelV4FilePart, 'data'> & {
  data: Uint8Array | string | URL;
};

/**
 * `LanguageModelV4Message` with any `LanguageModelV4FilePart` inside the
 * content array replaced by `GatewayLanguageModelV4FilePart`. Distributed over
 * the message role union; the `system` role (whose `content` is a string)
 * passes through unchanged.
 */
type GatewayLanguageModelV4Message = LanguageModelV4Message extends infer M
  ? M extends { content: Array<infer P> }
    ? Omit<M, 'content'> & {
        content: Array<
          P extends LanguageModelV4FilePart ? GatewayLanguageModelV4FilePart : P
        >;
      }
    : M
  : never;

/**
 * Call options as sent to the AI Gateway: same as `LanguageModelV4CallOptions`
 * but with file parts in the prompt flattened to the untagged data shape.
 */
type GatewayLanguageModelV4CallOptions = Omit<
  LanguageModelV4CallOptions,
  'prompt'
> & {
  prompt: GatewayLanguageModelV4Message[];
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
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  /**
   * Converts a V4 file part to the shape the AI Gateway accepts: the
   * discriminated `data` union is flattened to the V3-style untagged
   * `Uint8Array | string | URL`, raw bytes are base64-encoded into a data URL,
   * and the media type is expanded to a full `type/subtype` whenever possible
   * (some downstream providers require the full IANA media type).
   *
   * `reference` and `text` data variants are forwarded as-is so the Gateway
   * can reject them with a clear error rather than us silently dropping data.
   */
  private encodeFilePart(
    part: LanguageModelV4FilePart,
  ): GatewayLanguageModelV4FilePart {
    let mediaType = part.mediaType;
    try {
      mediaType = resolveFullMediaType({ part });
    } catch {
      // Could not resolve a full media type (e.g. URL-sourced data with a
      // top-level-only media type). Pass mediaType through and let the
      // Gateway / downstream provider decide.
    }

    const data = part.data;
    let flattenedData: GatewayLanguageModelV4FilePart['data'];
    if (data.type === 'data') {
      if (data.data instanceof Uint8Array) {
        const base64Data = Buffer.from(data.data).toString('base64');
        flattenedData = new URL(
          `data:${mediaType || 'application/octet-stream'};base64,${base64Data}`,
        );
      } else {
        flattenedData = data.data;
      }
    } else if (data.type === 'url') {
      flattenedData = data.url;
    } else {
      // `reference` / `text` variants have no V3 equivalent. Forward the
      // tagged object as-is and let the Gateway surface a clear error.
      flattenedData = data as unknown as GatewayLanguageModelV4FilePart['data'];
    }

    return { ...part, mediaType, data: flattenedData };
  }

  /**
   * Rewrites the prompt so every `file` part uses the Gateway-friendly shape
   * produced by `encodeFilePart`. Returns a fresh options object — callers
   * should treat the input as untouched.
   */
  private maybeEncodeFileParts(
    options: LanguageModelV4CallOptions,
  ): GatewayLanguageModelV4CallOptions {
    return {
      ...options,
      prompt: options.prompt.map(message => {
        if (typeof message.content === 'string') {
          return message;
        }
        return {
          ...message,
          content: message.content.map(part =>
            part.type === 'file' ? this.encodeFilePart(part) : part,
          ),
        };
      }) as GatewayLanguageModelV4Message[],
    };
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
