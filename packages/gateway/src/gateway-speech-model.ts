import type {
  SharedV3ProviderMetadata,
  SharedV3Warning,
  SpeechModelV3,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';

export class GatewaySpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3' as const;

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
  }: Parameters<SpeechModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<SpeechModelV3['doGenerate']>>
  > {
    const resolvedHeaders = await resolve(this.config.headers());
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
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        audio: responseBody.audio,
        warnings: (responseBody.warnings ?? []) as Array<SharedV3Warning>,
        providerMetadata:
          responseBody.providerMetadata as SharedV3ProviderMetadata,
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

  private getUrl() {
    return `${this.config.baseURL}/speech-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-speech-model-specification-version': '3',
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
