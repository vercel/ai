import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import type { ZodType } from 'zod/v4';
import { z } from './zod';

// https://vercel.com/docs/ai-gateway/provider-options
export const EVALUATION_FALLBACK_MAX_CONDITION_DEPTH = 5;
export const EVALUATION_FALLBACK_MAX_CONDITIONS_PER_LIST = 20;
export const EVALUATION_FALLBACK_MAX_QUESTION_LENGTH = 256;
export const EVALUATION_FALLBACK_MAX_MODEL_LENGTH = 256;

export const gatewayEvaluationProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        models: gatewayModelFallbacksSchema.optional(),
      })
      .catchall(z.unknown()),
  ),
);

/**
 * A condition on the primary model's answers. `QUESTION_ID` narrows
 * `question` to your question IDs. Groups nest at most five levels deep,
 * which the SDK checks at runtime.
 */
export type EvaluationFallbackCondition<QUESTION_ID extends string = string> =
  | ExclusiveCondition<{ question: QUESTION_ID; confidenceBelow: number }>
  | ExclusiveCondition<{
      question: QUESTION_ID;
      probabilityBetween: [number, number];
    }>
  | ExclusiveCondition<{ any: EvaluationFallbackConditionList<QUESTION_ID> }>
  | ExclusiveCondition<{ all: EvaluationFallbackConditionList<QUESTION_ID> }>
  | ExclusiveCondition<{
      atLeast: {
        count: number;
        conditions: EvaluationFallbackConditionList<QUESTION_ID>;
      };
    }>;

export type GatewayModelFallback<QUESTION_ID extends string = string> =
  | string
  | {
      model: string;
      when: EvaluationFallbackCondition<QUESTION_ID>;
    };

export type GatewayProviderOptions = {
  /**
   * Service-owned options may be added by the Gateway without requiring an SDK
   * release. The Gateway service validates and applies the runtime schema.
   */
  [key: string]: unknown;

  /** Request-scoped BYOK credentials to use instead of cached credentials. */
  byok?: Record<string, Array<Record<string, unknown>>>;

  /** Enables automatic caching behavior when supported by the Gateway. */
  caching?: 'auto';

  /** Filter to providers that do not train on prompt data. */
  disallowPromptTraining?: boolean;

  /**
   * Restrict routing to provider models that satisfy every given entry.
   *
   * Entries are capability tags (`'implicit-caching'`, `'reasoning'`,
   * `'tool-use'`, `'vision'`) or weight-format conditions: `'quantization:fp8'`
   * requires the serving provider to report that weight format,
   * `'!quantization:fp8'` excludes it (providers with no recorded format still
   * pass an exclusion). Format values are an open space but must match
   * `[a-zA-Z0-9._-]{1,32}` and compare case-insensitively; unknown capability
   * names are rejected by the Gateway with a 400.
   */
  has?: Array<
    | 'implicit-caching'
    | 'reasoning'
    | 'tool-use'
    | 'vision'
    | `quantization:${string}`
    | `!quantization:${string}`
  >;

  /**
   * Idempotency key for `experimental_startBatch`: retries with the same
   * key replay the original batch instead of creating a duplicate.
   */
  idempotencyKey?: string;

  /**
   * Array of model slugs specifying fallback models to use in order.
   * Conditional entries are only valid on evaluation requests, see
   * `GatewayEvaluationProviderOptions`.
   */
  models?: string[];

  /** Array of provider slugs that are the only ones allowed to be used. */
  only?: string[];

  /** Array of provider slugs specifying the provider attempt order. */
  order?: string[];

  /** Per-provider timeouts for BYOK credentials in milliseconds. */
  providerTimeouts?: {
    byok?: Record<string, number>;
  };

  /** Entity identifier against which quota is tracked. */
  quotaEntityId?: string;

  /** Unified service tier intent. */
  serviceTier?: 'flex' | 'priority';

  /** Sort providers by a performance or cost metric before routing. */
  sort?: 'cost' | 'tps' | 'ttft';

  /** User-specified tags for reporting and filtering usage. */
  tags?: string[];

  /** End-user identifier for spend tracking and attribution. */
  user?: string;

  /** Filter to providers with zero data retention agreements. */
  zeroDataRetention?: boolean;
};

/**
 * Gateway provider options for evaluation requests. Same as
 * `GatewayProviderOptions`, except `models` may start with one conditional
 * `{ model, when }` entry followed by string error fallbacks.
 *
 * The SDK validates `models` strictly before sending the request, so new
 * condition shapes need an SDK release. Other keys pass through unchanged.
 */
export type GatewayEvaluationProviderOptions<
  QUESTION_ID extends string = string,
> = GatewayProviderOptionsWithoutModels & {
  models?: GatewayModelFallbackList<QUESTION_ID>;
};

type EvaluationFallbackConditionList<QUESTION_ID extends string> = [
  EvaluationFallbackCondition<QUESTION_ID>,
  ...EvaluationFallbackCondition<QUESTION_ID>[],
];

type ConditionKey =
  | 'question'
  | 'confidenceBelow'
  | 'probabilityBetween'
  | 'any'
  | 'all'
  | 'atLeast';

// Rules out the other shapes' keys, so a condition can't mix two shapes.
type ExclusiveCondition<CONDITION> = CONDITION & {
  [KEY in Exclude<ConditionKey, keyof CONDITION>]?: never;
};

type GatewayProviderOptionsWithoutModels = {
  [KEY in keyof GatewayProviderOptions as KEY extends 'models'
    ? never
    : KEY]: GatewayProviderOptions[KEY];
};

type ConditionalGatewayModelFallback<QUESTION_ID extends string> = Exclude<
  GatewayModelFallback<QUESTION_ID>,
  string
>;

type GatewayModelFallbackList<QUESTION_ID extends string> =
  | string[]
  | [ConditionalGatewayModelFallback<QUESTION_ID>, ...string[]];

const probabilitySchema = z.number().finite().min(0).max(1);
const questionSchema = z
  .string()
  .min(1)
  .max(EVALUATION_FALLBACK_MAX_QUESTION_LENGTH);
const directConditionSchema = z.union([
  z
    .object({
      question: questionSchema,
      confidenceBelow: probabilitySchema,
    })
    .strict(),
  z
    .object({
      question: questionSchema,
      probabilityBetween: z
        .tuple([probabilitySchema, probabilitySchema])
        .refine(([minimum, maximum]) => minimum <= maximum, {
          message:
            'probabilityBetween minimum must be less than or equal to maximum',
        }),
    })
    .strict(),
]) as ZodType<EvaluationFallbackCondition>;

const groupBeyondMaxDepthSchema = z
  .union([
    z.object({ any: z.unknown() }),
    z.object({ all: z.unknown() }),
    z.object({ atLeast: z.unknown() }),
  ])
  .superRefine((_, context) => {
    context.addIssue({
      code: 'custom',
      message: `conditions can be nested at most ${EVALUATION_FALLBACK_MAX_CONDITION_DEPTH} levels deep`,
    });
  });

const conditionalModelFallbackSchema = z
  .object({
    model: z.string().min(1).max(EVALUATION_FALLBACK_MAX_MODEL_LENGTH),
    when: conditionSchema(1),
  })
  .strict();

const gatewayModelFallbacksSchema = z
  .array(z.union([z.string(), conditionalModelFallbackSchema]))
  .superRefine((entries, context) => {
    const conditionalIndexes = entries.flatMap((entry, index) =>
      typeof entry === 'string' ? [] : [index],
    );
    if (conditionalIndexes.length > 1) {
      context.addIssue({
        code: 'custom',
        message: 'models supports at most one conditional evaluation fallback',
      });
    }
    if (conditionalIndexes[0] !== undefined && conditionalIndexes[0] !== 0) {
      context.addIssue({
        code: 'custom',
        message:
          'a conditional evaluation fallback must be the first models entry',
        path: [conditionalIndexes[0]],
      });
    }
  });

function conditionSchema(depth: number): ZodType<EvaluationFallbackCondition> {
  if (depth === EVALUATION_FALLBACK_MAX_CONDITION_DEPTH) {
    return z.union([
      directConditionSchema,
      groupBeyondMaxDepthSchema,
    ]) as ZodType<EvaluationFallbackCondition>;
  }

  const childConditionSchema = conditionSchema(depth + 1);
  const conditionListSchema = z
    .array(childConditionSchema)
    .min(1)
    .max(EVALUATION_FALLBACK_MAX_CONDITIONS_PER_LIST);

  return z.union([
    directConditionSchema,
    z.object({ any: conditionListSchema }).strict(),
    z.object({ all: conditionListSchema }).strict(),
    z
      .object({
        atLeast: z
          .object({
            count: z.number().int().min(1),
            conditions: conditionListSchema,
          })
          .strict()
          .refine(({ count, conditions }) => count <= conditions.length, {
            message: 'atLeast count cannot exceed the number of conditions',
            path: ['count'],
          }),
      })
      .strict(),
  ]) as ZodType<EvaluationFallbackCondition>;
}
