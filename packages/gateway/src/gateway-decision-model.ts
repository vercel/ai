import {
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
  type JSONValue,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
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

  /** @deprecated Use `doDecide` instead. */
  doEvaluate(options: Parameters<DecisionModelV4['doDecide']>[0]) {
    return this.doDecide(options);
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
    const requestState = toGatewayDecisionState(state);
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
          ...requestState,
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
    return `${this.config.baseURL}/decision-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-decision-model-specification-version': '4',
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
  z.object({
    type: z.literal('refusal'),
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

function toGatewayDecisionState(
  state: DecisionModelV4State,
): { state: JSONValue } | { stateParts: DecisionModelV4State } {
  const [part] = state;
  if (state.length === 1 && part.type === 'text') {
    return { state: part.text };
  }
  if (
    state.length === 1 &&
    part.type === 'json' &&
    typeof part.value === 'object' &&
    part.value !== null
  ) {
    return { state: part.value };
  }
  return {
    stateParts: state.map(statePart => {
      if (statePart.type !== 'file') return statePart;
      if (statePart.data.type !== 'data') {
        throw new UnsupportedFunctionalityError({
          functionality: `Gateway decision file input: ${statePart.data.type} data`,
        });
      }
      const { data } = statePart.data;
      return {
        ...statePart,
        data: {
          type: 'data',
          data:
            typeof data === 'string' ? data : convertUint8ArrayToBase64(data),
        },
      };
    }),
  };
}
