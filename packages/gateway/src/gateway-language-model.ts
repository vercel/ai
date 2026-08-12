import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4StreamPart,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamResult,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  postToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type ParseResult,
  type Resolvable,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { encodeCbor } from './cbor';
import { z } from './zod';
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

  /**
   * Set when the gateway rejects a CBOR body with 415; CBOR is not retried
   * for the life of this model instance.
   */
  private cborUnsupported = false;

  private async getArgs(options: LanguageModelV4CallOptions) {
    const { abortSignal: _abortSignal, ...optionsWithoutSignal } = options;

    return {
      args: optionsWithoutSignal,
      warnings: [],
    };
  }

  private shouldUseCbor(options: LanguageModelV4CallOptions): boolean {
    return (
      this.config.encoding === 'cbor' &&
      !this.cborUnsupported &&
      hasInlineFileData(options.prompt)
    );
  }

  /**
   * POSTs the call options as CBOR when requested, falling back to the JSON
   * encoding (with base64 file parts) on a 415. The JSON leg is the
   * historical wire format.
   */
  private async postCallOptions<T>({
    args,
    abortSignal,
    headers,
    useCbor,
    successfulResponseHandler,
  }: {
    args: Omit<LanguageModelV4CallOptions, 'abortSignal'>;
    abortSignal: AbortSignal | undefined;
    headers: Record<string, string | undefined>;
    useCbor: boolean;
    successfulResponseHandler: ResponseHandler<T>;
  }) {
    const failedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: z.any(),
      errorToMessage: data => data,
    });

    if (useCbor) {
      try {
        return await postToApi<T>({
          url: this.getUrl(),
          headers: { 'Content-Type': 'application/cbor', ...headers },
          body: { content: encodeCbor(args), values: args },
          successfulResponseHandler,
          failedResponseHandler,
          ...(abortSignal && { abortSignal }),
          fetch: this.config.fetch,
        });
      } catch (error) {
        if (!APICallError.isInstance(error) || error.statusCode !== 415) {
          throw error;
        }
        this.cborUnsupported = true;
      }
    }

    return postJsonToApi<T>({
      url: this.getUrl(),
      headers,
      body: this.maybeEncodeFileParts(args),
      successfulResponseHandler,
      failedResponseHandler,
      ...(abortSignal && { abortSignal }),
      fetch: this.config.fetch,
    });
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
      } = await this.postCallOptions({
        args,
        abortSignal,
        headers: combineHeaders(
          resolvedHeaders,
          options.headers,
          this.getModelConfigHeaders(this.modelId, false),
          await resolve(this.config.o11yHeaders),
        ),
        useCbor: this.shouldUseCbor(options),
        successfulResponseHandler: createJsonResponseHandler(z.any()),
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
      const { value: response, responseHeaders } = await this.postCallOptions({
        args,
        abortSignal,
        headers: combineHeaders(
          resolvedHeaders,
          options.headers,
          this.getModelConfigHeaders(this.modelId, true),
          await resolve(this.config.o11yHeaders),
        ),
        useCbor: this.shouldUseCbor(options),
        successfulResponseHandler: createEventSourceResponseHandler(z.any()),
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
  private maybeEncodeFileParts(options: LanguageModelV4CallOptions) {
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

/**
 * True when the prompt carries at least one inline `Uint8Array` file payload
 * (file, reasoning-file, or tool-result file part) — the only case where
 * CBOR beats the JSON/base64 encoding on the wire.
 */
function hasInlineFileData(
  prompt: LanguageModelV4CallOptions['prompt'],
): boolean {
  for (const message of prompt) {
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (
        (part.type === 'file' || part.type === 'reasoning-file') &&
        isInlineBytesFileData(part.data)
      ) {
        return true;
      }
      if (part.type === 'tool-result' && part.output.type === 'content') {
        for (const contentPart of part.output.value) {
          if (
            contentPart.type === 'file' &&
            isInlineBytesFileData(contentPart.data)
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function isInlineBytesFileData(data: { type: string }): boolean {
  return (
    data.type === 'data' &&
    (data as { data?: unknown }).data instanceof Uint8Array
  );
}
