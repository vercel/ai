import {
  APICallError,
  Experimental_ExtractionUnsupportedFieldTypeError as ExtractionUnsupportedFieldTypeError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
  type Experimental_ExtractionModelV4 as ExtractionModelV4,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  lazySchema,
  postJsonToApi,
  resolve,
  safeValidateTypes,
  zodSchema,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError } from './errors';
import { extractApiCallResponse } from './errors/extract-api-call-response';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';

export class GatewayExtractionModel implements ExtractionModelV4 {
  readonly specificationVersion = 'v4';

  // Support varies by model, so the gateway rejects unsupported fields.
  readonly supportedFieldTypes = [
    'text',
    'number',
    'date',
    'time',
    'datetime',
    'duration',
    'list',
  ] as const;

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

  async doExtract({
    state,
    fields,
    referenceDate,
    maxOutputTokens,
    reasoning,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<ExtractionModelV4['doExtract']>[0]): Promise<
    Awaited<ReturnType<ExtractionModelV4['doExtract']>>
  > {
    const stateParts = toGatewayExtractionState(state);
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
          stateParts,
          fields,
          referenceDate,
          maxOutputTokens,
          reasoning,
          ...(providerOptions ? { providerOptions } : {}),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayExtractionResponseSchema,
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
      const unsupportedField = await getUnsupportedField(error);
      if (unsupportedField != null) {
        throw new ExtractionUnsupportedFieldTypeError({
          ...unsupportedField,
          provider: this.provider,
          modelId: this.modelId,
        });
      }
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  private getUrl() {
    return `${this.config.baseURL}/extraction-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-extraction-model-specification-version': '4',
      'ai-model-id': this.modelId,
    };
  }
}

const gatewayExtractionSourceSchema = () =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      part: z.number(),
      start: z.number(),
      end: z.number(),
    }),
    z.object({
      type: z.literal('file'),
      part: z.number(),
    }),
  ]);

const stringAnswerSchema = <TYPE extends string>(type: TYPE) =>
  z.object({
    type: z.literal(type),
    value: z.nullable(z.string()),
    guess: z.optional(z.string()),
    pNull: z.optional(z.number()),
    confidence: z.optional(z.number()),
    source: z.optional(gatewayExtractionSourceSchema()),
  });

const numberAnswerSchema = <TYPE extends string>(type: TYPE) =>
  z.object({
    type: z.literal(type),
    value: z.nullable(z.number()),
    guess: z.optional(z.number()),
    pNull: z.optional(z.number()),
    confidence: z.optional(z.number()),
    source: z.optional(gatewayExtractionSourceSchema()),
  });

const gatewayExtractionAnswerSchema = () =>
  z.discriminatedUnion('type', [
    stringAnswerSchema('text'),
    numberAnswerSchema('number'),
    stringAnswerSchema('date'),
    stringAnswerSchema('time'),
    stringAnswerSchema('datetime'),
    numberAnswerSchema('duration'),
    z.object({
      type: z.literal('list'),
      value: z.nullable(z.union([z.array(z.string()), z.array(z.number())])),
      pNull: z.optional(z.number()),
      confidence: z.optional(z.number()),
      items: z.optional(
        z.array(
          z.object({
            confidence: z.optional(z.number()),
            source: z.optional(gatewayExtractionSourceSchema()),
          }),
        ),
      ),
    }),
    z.object({
      type: z.literal('refusal'),
    }),
  ]);

const gatewayExtractionWarningSchema = () =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('unsupported'),
      feature: z.string(),
      details: z.optional(z.string()),
    }),
    z.object({
      type: z.literal('compatibility'),
      feature: z.string(),
      details: z.optional(z.string()),
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

const gatewayExtractionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      answers: z.record(z.string(), gatewayExtractionAnswerSchema()),
      model: z.optional(z.string()),
      usage: z.optional(
        z.object({
          inputTokens: z.optional(z.number()),
          outputTokens: z.optional(z.number()),
        }),
      ),
      warnings: z.optional(z.array(gatewayExtractionWarningSchema())),
      providerMetadata: z.optional(
        z.record(z.string(), z.record(z.string(), z.unknown())),
      ),
    }),
  ),
);

const gatewayUnsupportedFieldErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        type: z.literal('invalid_request_error'),
        param: z.object({
          name: z.literal('AI_ExtractionUnsupportedFieldTypeError'),
          fieldId: z.string(),
          fieldType: z.string(),
        }),
      }),
    }),
  ),
);

/** Reads the field from the gateway's unsupported field type response. */
async function getUnsupportedField(
  error: unknown,
): Promise<{ fieldId: string; fieldType: string } | undefined> {
  if (!APICallError.isInstance(error)) return undefined;
  const result = await safeValidateTypes({
    value: extractApiCallResponse(error),
    schema: gatewayUnsupportedFieldErrorSchema,
  });
  if (!result.success) return undefined;
  const { fieldId, fieldType } = result.value.error.param;
  return { fieldId, fieldType };
}

function toGatewayExtractionState(
  state: DecisionModelV4State,
): DecisionModelV4State {
  return state.map(part => {
    if (part.type !== 'file' || part.data.type === 'reference') return part;
    if (part.data.type !== 'data') {
      throw new UnsupportedFunctionalityError({
        functionality: `Gateway extraction file input: ${part.data.type} data`,
      });
    }
    const { data } = part.data;
    return {
      ...part,
      data: {
        type: 'data',
        data: typeof data === 'string' ? data : convertUint8ArrayToBase64(data),
      },
    };
  });
}
