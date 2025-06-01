import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FilePart,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import { APICallError } from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import type { GatewayConfig } from './gateway-config';
import type { GatewayModelId } from './gateway-language-model-settings';
import {
  createGatewayErrorFromResponse,
  GatewayError,
  extractApiCallResponse,
} from './errors';

type GatewayChatConfig = GatewayConfig & {
  provider: string;
  o11yHeaders: Record<string, string>;
};

export class GatewayLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly supportedUrls = { '*/*': [/.*/] };

  constructor(
    readonly modelId: GatewayModelId,
    private readonly config: GatewayChatConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { abortSignal, ...body } = options;
    try {
      const {
        responseHeaders,
        value: responseBody,
        rawValue: rawResponse,
      } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          await resolve(this.config.headers()),
          options.headers,
          this.getModelConfigHeaders(this.modelId, false),
          this.config.o11yHeaders,
        ),
        body: this.maybeEncodeFileParts(body),
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
        request: { body },
        response: { headers: responseHeaders, body: rawResponse },
        warnings: [],
      };
    } catch (error) {
      throw asGatewayError(error);
    }
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { abortSignal, ...body } = options;

    try {
      const { value: response, responseHeaders } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          await resolve(this.config.headers()),
          options.headers,
          this.getModelConfigHeaders(this.modelId, true),
          this.config.o11yHeaders,
        ),
        body: this.maybeEncodeFileParts(body),
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
            ParseResult<LanguageModelV2StreamPart>,
            LanguageModelV2StreamPart
          >({
            transform(chunk, controller) {
              if (chunk.success) {
                controller.enqueue(chunk.value);
              } else {
                controller.error(
                  (chunk as { success: false; error: unknown }).error,
                );
              }
            },
          }),
        ),
        request: { body },
        response: { headers: responseHeaders },
      };
    } catch (error) {
      throw asGatewayError(error);
    }
  }

  private isFilePart(part: unknown) {
    return (
      part && typeof part === 'object' && 'type' in part && part.type === 'file'
    );
  }

  /**
   * Encodes image parts in the prompt to base64. Mutates the passed options
   * instance directly to avoid copying the image data.
   * @param options - The options to encode.
   * @returns The options with the image parts encoded.
   */
  private maybeEncodeFileParts(options: LanguageModelV2CallOptions) {
    for (const message of options.prompt) {
      for (const part of message.content) {
        if (this.isFilePart(part)) {
          const filePart = part as LanguageModelV2FilePart;
          // If the image part is a URL it will get cleanly converted to a string.
          // If it's a binary image attachment we convert it to a data url.
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
      'ai-language-model-specification-version': '2',
      'ai-language-model-id': modelId,
      'ai-language-model-streaming': String(streaming),
    };
  }
}

function asGatewayError(error: unknown) {
  if (GatewayError.isInstance(error)) {
    return error;
  }

  if (APICallError.isInstance(error)) {
    return createGatewayErrorFromResponse({
      response: extractApiCallResponse(error),
      statusCode: error.statusCode ?? 500,
      defaultMessage: 'Gateway request failed',
      cause: error,
    });
  }

  return createGatewayErrorFromResponse({
    response: {},
    statusCode: 500,
    defaultMessage:
      error instanceof Error
        ? `Gateway request failed: ${error.message}`
        : 'Unknown Gateway error',
    cause: error,
  });
}
