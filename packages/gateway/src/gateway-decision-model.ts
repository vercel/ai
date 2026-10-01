import type {
  Experimental_DecisionModelV4 as DecisionModelV4,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';
import { gatewayDecisionProviderOptionsSchema } from './gateway-provider-options';

export class GatewayDecisionModel implements DecisionModelV4 {
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

  async doDecide({
    state,
    questions,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<DecisionModelV4['doDecide']>[0]): Promise<
    Awaited<ReturnType<DecisionModelV4['doDecide']>>
  > {
    const gatewayOptions = await parseProviderOptions({
      provider: 'gateway',
      providerOptions,
      schema: gatewayDecisionProviderOptionsSchema,
    });
    const validatedProviderOptions =
      gatewayOptions == null
        ? providerOptions
        : { ...providerOptions, gateway: gatewayOptions };
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
          ...(validatedProviderOptions
            ? { providerOptions: validatedProviderOptions }
            : {}),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayDecisionResponseSchema,
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
          modelId: responseBody.model ?? this.modelId,
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

const gatewayDecisionAnswerSchema = z.discriminatedUnion('type', [
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

const gatewayDecisionWarningSchema = z.discriminatedUnion('type', [
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

const gatewayDecisionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      answers: z.record(z.string(), gatewayDecisionAnswerSchema),
      model: z.string().optional(),
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
      warnings: z.array(gatewayDecisionWarningSchema).optional(),
      providerMetadata: z
        .record(z.string(), z.record(z.string(), z.unknown()))
        .optional(),
    }),
  ),
);
