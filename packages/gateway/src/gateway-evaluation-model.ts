import type {
  Experimental_EvaluationModelV4 as EvaluationModelV4,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  lazySchema,
  postJsonToApi,
  resolve,
  zodSchema,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';

export class GatewayEvaluationModel implements EvaluationModelV4 {
  readonly specificationVersion = 'v4';

  readonly supportedQuestionTypes = ['choice', 'score', 'boolean'] as const;

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

  async doEvaluate({
    state,
    questions,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EvaluationModelV4['doEvaluate']>[0]): Promise<
    Awaited<ReturnType<EvaluationModelV4['doEvaluate']>>
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
          state,
          questions,
          ...(providerOptions ? { providerOptions } : {}),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayEvaluationResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        answers: responseBody.answers,
        ...(responseBody.rounding ? { rounding: responseBody.rounding } : {}),
        ...(responseBody.usage ? { usage: responseBody.usage } : {}),
        warnings: responseBody.warnings ?? [],
        providerMetadata:
          responseBody.providerMetadata as unknown as SharedV4ProviderMetadata,
        response: {
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
    return `${this.config.baseURL}/evaluation-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-evaluation-model-specification-version': '4',
      'ai-model-id': this.modelId,
    };
  }
}

const gatewayEvaluationAnswerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()).optional(),
  }),
  z.object({
    type: z.literal('score'),
    score: z.number(),
    probabilities: z.record(z.string(), z.number()).optional(),
  }),
  z.object({
    type: z.literal('boolean'),
    probability: z.number(),
  }),
]);

const gatewayEvaluationWarningSchema = z.discriminatedUnion('type', [
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

const gatewayEvaluationResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      answers: z.record(z.string(), gatewayEvaluationAnswerSchema),
      rounding: z
        .object({
          probabilityDecimals: z.number().optional(),
          scoreDecimals: z.number().optional(),
        })
        .optional(),
      usage: z
        .object({
          inputTokens: z.number().optional(),
          outputTokens: z.number().optional(),
        })
        .optional(),
      warnings: z.array(gatewayEvaluationWarningSchema).optional(),
      providerMetadata: z
        .record(z.string(), z.record(z.string(), z.unknown()))
        .optional(),
    }),
  ),
);
