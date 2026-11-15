import {
  APICallError,
  Experimental_ExtractionUnsupportedFieldTypeError as ExtractionUnsupportedFieldTypeError,
  type Experimental_ExtractionModelV4 as ExtractionModelV4,
  type Experimental_ExtractionModelV4Result as ExtractionModelV4Result,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
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
import { gatewayWarningSchema } from './gateway-warning-schema';
import { toGatewayStateParts } from './to-gateway-state-parts';

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
    const stateParts = toGatewayStateParts({
      state,
      modelType: 'extraction',
      allowReferences: true,
    });
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
        answers: omitNulls(
          responseBody.answers,
        ) as ExtractionModelV4Result['answers'],
        ...(responseBody.usage
          ? {
              usage: {
                inputTokens: responseBody.usage.inputTokens ?? undefined,
                outputTokens: responseBody.usage.outputTokens ?? undefined,
              },
            }
          : {}),
        warnings: responseBody.warnings ?? [],
        providerMetadata: (responseBody.providerMetadata ??
          undefined) as unknown as SharedV4ProviderMetadata,
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
    guess: z.nullish(z.string()),
    pNull: z.nullish(z.number()),
    confidence: z.nullish(z.number()),
    source: z.nullish(gatewayExtractionSourceSchema()),
  });

const numberAnswerSchema = <TYPE extends string>(type: TYPE) =>
  z.object({
    type: z.literal(type),
    value: z.nullable(z.number()),
    guess: z.nullish(z.number()),
    pNull: z.nullish(z.number()),
    confidence: z.nullish(z.number()),
    source: z.nullish(gatewayExtractionSourceSchema()),
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
      pNull: z.nullish(z.number()),
      confidence: z.nullish(z.number()),
      items: z.nullish(
        z.array(
          z.object({
            confidence: z.nullish(z.number()),
            source: z.nullish(gatewayExtractionSourceSchema()),
          }),
        ),
      ),
    }),
    z.object({
      type: z.literal('refusal'),
    }),
  ]);

// Warnings are advisory: one this client does not know is kept as `other`
// instead of failing a successful response.
const gatewayExtractionWarningSchema = () =>
  z.union([
    gatewayWarningSchema(),
    z.pipe(
      z.unknown(),
      z.transform(warning => ({
        type: 'other' as const,
        message: `Unknown warning: ${JSON.stringify(warning)}`,
      })),
    ),
  ]);

const gatewayExtractionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      answers: z.record(z.string(), gatewayExtractionAnswerSchema()),
      model: z.nullish(z.string()),
      usage: z.nullish(
        z.object({
          inputTokens: z.nullish(z.number()),
          outputTokens: z.nullish(z.number()),
        }),
      ),
      warnings: z.nullish(z.array(gatewayExtractionWarningSchema())),
      providerMetadata: z.nullish(
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

/** Drops `null` optional fields, which the specification leaves out. */
function omitNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitNulls);
  if (value == null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => entry !== null || key === 'value')
      .map(([key, entry]) => [key, omitNulls(entry)]),
  );
}
