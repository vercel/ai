import {
  InvalidArgumentError,
  type Experimental_SharedV4Session,
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
  resolve,
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
import {
  assertGatewayLanguageModelTransport,
  getGatewayLanguageModelWebSocketSession,
} from './gateway-language-model-websocket';

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

  private async getArgs(options: LanguageModelV4CallOptions) {
    const transport = getGatewayTransport(options.providerOptions);
    const {
      abortSignal: _abortSignal,
      experimental_session: _experimentalSession,
      ...args
    } = options;

    if (args.providerOptions?.gateway?.transport !== undefined) {
      const { transport: _transport, ...gatewayOptions } =
        args.providerOptions.gateway;
      args.providerOptions = {
        ...args.providerOptions,
        gateway: gatewayOptions,
      };
    }

    return {
      args: this.maybeEncodeFileParts(args),
      transport,
      warnings: [],
    };
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const { args, transport, warnings } = await this.getArgs(options);
    const { abortSignal } = options;

    assertGatewayLanguageModelTransport({
      session: options.experimental_session,
      transport,
    });

    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    const o11yHeaders = await resolve(this.config.o11yHeaders);
    const requestHeaders = combineHeaders(
      resolvedHeaders,
      options.headers,
      this.getModelConfigHeaders(this.modelId, false),
      o11yHeaders,
    );

    try {
      if (transport === 'websocket') {
        const responseBody = await getGatewayLanguageModelWebSocketSession(
          options.experimental_session as Experimental_SharedV4Session,
        ).generate({
          url: this.getUrl(),
          webSocket: this.config.webSocket,
          connectionHeaders: combineHeaders(resolvedHeaders, options.headers),
          requestHeaders,
          body: args,
          abortSignal,
          authMethod: await parseAuthMethod(resolvedHeaders ?? {}),
        });

        return {
          ...responseBody,
          request: { body: args },
          response: { body: responseBody },
          warnings,
        };
      }

      const {
        responseHeaders,
        value: responseBody,
        rawValue: rawResponse,
      } = await postJsonToApi({
        url: this.getUrl(),
        headers: requestHeaders,
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
      if (InvalidArgumentError.isInstance(error)) {
        throw error;
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
    const { args, transport, warnings } = await this.getArgs(options);
    const { abortSignal } = options;

    assertGatewayLanguageModelTransport({
      session: options.experimental_session,
      transport,
    });

    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    const o11yHeaders = await resolve(this.config.o11yHeaders);
    const requestHeaders = combineHeaders(
      resolvedHeaders,
      options.headers,
      this.getModelConfigHeaders(this.modelId, true),
      o11yHeaders,
    );

    try {
      if (transport === 'websocket') {
        const response = await getGatewayLanguageModelWebSocketSession(
          options.experimental_session as Experimental_SharedV4Session,
        ).stream({
          url: this.getUrl(),
          webSocket: this.config.webSocket,
          connectionHeaders: combineHeaders(resolvedHeaders, options.headers),
          requestHeaders,
          body: args,
          abortSignal,
          authMethod: await parseAuthMethod(resolvedHeaders ?? {}),
        });

        return {
          stream: transformGatewayLanguageModelStream({
            stream: response,
            options,
            warnings,
          }),
          request: { body: args },
        };
      }

      const { value: response, responseHeaders } = await postJsonToApi({
        url: this.getUrl(),
        headers: requestHeaders,
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
        stream: transformGatewayLanguageModelStream({
          stream: response.pipeThrough(
            new TransformStream<
              ParseResult<LanguageModelV4StreamPart>,
              LanguageModelV4StreamPart
            >({
              transform(chunk, controller) {
                if (chunk.success) {
                  controller.enqueue(chunk.value);
                } else {
                  controller.error(chunk.error);
                }
              },
            }),
          ),
          options,
          warnings,
        }),
        request: { body: args },
        response: { headers: responseHeaders },
      };
    } catch (error) {
      if (InvalidArgumentError.isInstance(error)) {
        throw error;
      }
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

function transformGatewayLanguageModelStream({
  stream,
  options,
  warnings,
}: {
  stream: ReadableStream<LanguageModelV4StreamPart>;
  options: LanguageModelV4CallOptions;
  warnings: LanguageModelV4GenerateResult['warnings'];
}): ReadableStream<LanguageModelV4StreamPart> {
  return stream.pipeThrough(
    new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
      start(controller) {
        if (warnings.length > 0) {
          controller.enqueue({ type: 'stream-start', warnings });
        }
      },
      transform(streamPart, controller) {
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
      },
    }),
  );
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

function getGatewayTransport(
  providerOptions: LanguageModelV4CallOptions['providerOptions'],
): 'http' | 'websocket' {
  const gatewayTransport = providerOptions?.gateway?.transport;

  if (gatewayTransport !== undefined) {
    if (gatewayTransport !== 'http' && gatewayTransport !== 'websocket') {
      throw new InvalidArgumentError({
        argument: 'providerOptions.gateway.transport',
        message:
          "AI Gateway transport must be either 'http' or 'websocket' when provided.",
      });
    }

    return gatewayTransport;
  }

  return Object.values(providerOptions ?? {}).some(
    options => options.transport === 'websocket',
  )
    ? 'websocket'
    : 'http';
}
