import {
  InvalidResponseDataError,
  type Experimental_SpeechModelV4StreamPart,
  type Experimental_SpeechModelV4StreamResult,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
  type SpeechModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  postJsonToApi,
  resolve,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError, GatewayInternalServerError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';

export class GatewaySpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4' as const;

  constructor(
    readonly modelId: string,
    private readonly config: GatewayConfig & {
      provider: string;
      o11yHeaders: Resolvable<Record<string, string>>;
    },
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate({
    text,
    voice,
    outputFormat,
    instructions,
    speed,
    language,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<SpeechModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<SpeechModelV4['doGenerate']>>
  > {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    try {
      const {
        responseHeaders,
        value: responseBody,
        rawValue,
      } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(),
          await resolve(this.config.o11yHeaders),
        ),
        body: {
          text,
          ...(voice && { voice }),
          ...(outputFormat && { outputFormat }),
          ...(instructions && { instructions }),
          ...(speed != null && { speed }),
          ...(language && { language }),
          ...(providerOptions && { providerOptions }),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewaySpeechResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        audio: responseBody.audio,
        warnings: (responseBody.warnings ?? []) as Array<SharedV4Warning>,
        providerMetadata:
          responseBody.providerMetadata as SharedV4ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
          body: rawValue,
        },
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  async doStream({
    abortSignal,
    headers,
    ...options
  }: Parameters<
    NonNullable<SpeechModelV4['doStream']>
  >[0]): Promise<Experimental_SpeechModelV4StreamResult> {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    try {
      const { value, responseHeaders } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers,
          this.getModelConfigHeaders(),
          { 'ai-speech-model-streaming': 'true' },
          await resolve(this.config.o11yHeaders),
        ),
        body: options,
        successfulResponseHandler: createEventSourceResponseHandler(
          gatewaySpeechStreamSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        abortSignal,
        fetch: this.config.fetch,
      });
      const reader = value.getReader();
      let warnings: SharedV4Warning[];
      try {
        const first = await reader.read();
        if (first.done)
          throw new InvalidResponseDataError({
            data: undefined,
            message: 'Gateway speech stream is empty.',
          });
        if (!first.value.success) throw first.value.error;
        if (first.value.value.type !== 'stream-start')
          throw new InvalidResponseDataError({
            data: first.value.value,
            message: 'Expected a speech stream-start event.',
          });
        warnings = first.value.value.warnings;
      } catch (error) {
        try {
          await reader.cancel(error);
        } finally {
          reader.releaseLock();
        }
        throw error;
      }
      let closed = false;
      return {
        warnings,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
        },
        stream: new ReadableStream<Experimental_SpeechModelV4StreamPart>({
          async pull(controller) {
            try {
              const next = await reader.read();
              if (closed) return;
              if (next.done) {
                closed = true;
                reader.releaseLock();
                controller.close();
                return;
              }
              if (!next.value.success) throw next.value.error;
              const part = next.value.value;
              if (part.type === 'error')
                throw new GatewayInternalServerError({
                  message: part.error.message,
                });
              if (part.type === 'stream-start')
                throw new InvalidResponseDataError({
                  data: part,
                  message: 'Unexpected duplicate speech stream-start event.',
                });
              controller.enqueue({
                ...part,
                providerMetadata: part.providerMetadata as
                  | SharedV4ProviderMetadata
                  | undefined,
              });
            } catch (error) {
              if (closed) return;
              closed = true;
              controller.error(error);
              try {
                await reader.cancel(error);
              } finally {
                reader.releaseLock();
              }
            }
          },
          async cancel(reason) {
            if (closed) return;
            closed = true;
            try {
              await reader.cancel(reason);
            } finally {
              reader.releaseLock();
            }
          },
        }),
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  private getUrl() {
    return `${this.config.baseURL}/speech-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-speech-model-specification-version': '4',
      'ai-model-id': this.modelId,
    };
  }
}

const providerMetadataEntrySchema = z.object({}).catchall(z.unknown());

const gatewaySpeechWarningSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('unsupported'),
    feature: z.string(),
    details: z.string().optional(),
  }),
  z.object({
    type: z.literal('compatibility'),
    feature: z.string(),
    details: z.string().optional(),
  }),
  z.object({
    type: z.literal('deprecated'),
    setting: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('other'),
    message: z.string(),
  }),
]);

const gatewaySpeechResponseSchema = z.object({
  audio: z.string(),
  warnings: z.array(gatewaySpeechWarningSchema).optional(),
  providerMetadata: z
    .record(z.string(), providerMetadataEntrySchema)
    .optional(),
});

const gatewaySpeechStreamSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stream-start'),
    warnings: z.array(gatewaySpeechWarningSchema),
  }),
  z.object({
    type: z.literal('audio'),
    audio: z.string(),
    mediaType: z.string(),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .optional(),
  }),
  z.object({
    type: z.literal('finish'),
    finishReason: z.object({
      unified: z.enum(['stop', 'length', 'content-filter', 'error', 'other']),
      raw: z.string().optional(),
    }),
    usage: z.object({
      inputTokens: z.number().nonnegative().optional(),
      outputTokens: z.number().nonnegative().optional(),
    }),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .optional(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.object({ message: z.string() }),
  }),
]);
