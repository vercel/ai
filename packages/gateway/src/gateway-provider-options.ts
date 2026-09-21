import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import type { ZodType } from 'zod/v4';
import { z } from './zod';

// https://vercel.com/docs/ai-gateway/provider-options
export const EVALUATION_FALLBACK_MAX_CONDITION_DEPTH = 4;

export const gatewayEvaluationProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        models: gatewayModelFallbacksSchema.optional(),
      })
      .catchall(z.unknown()),
  ),
);

export type EvaluationFallbackCondition<QUESTION_ID extends string = string> =
  EvaluationFallbackConditionAtDepth1<QUESTION_ID>;

export type GatewayModelFallback<QUESTION_ID extends string = string> =
  | string
  | {
      model: string;
      when: EvaluationFallbackCondition<QUESTION_ID>;
    };

export type GatewayProviderOptions<QUESTION_ID extends string = string> = {
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
   * Restrict routing to models that have all of the given capabilities.
   * Currently supports `'implicit-caching'`, `'reasoning'`, `'tool-use'`, and
   * `'vision'` (image input).
   */
  has?: Array<'implicit-caching' | 'reasoning' | 'tool-use' | 'vision'>;

  /**
   * Idempotency key for `experimental_startBatch`: retries with the same
   * key replay the original batch instead of creating a duplicate.
   */
  idempotencyKey?: string;

  /**
   * Fallback models to use in order. Conditional entries are only valid for
   * evaluation requests. At most one conditional entry is allowed, it must be
   * first, and string error fallbacks may follow it.
   */
  models?: GatewayModelFallbackList<QUESTION_ID>;

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

type EvaluationFallbackDirectCondition<QUESTION_ID extends string> =
  | {
      question: QUESTION_ID;
      confidenceBelow: number;
      probabilityBetween?: never;
      all?: never;
      any?: never;
      atLeast?: never;
    }
  | {
      question: QUESTION_ID;
      confidenceBelow?: never;
      probabilityBetween: readonly [number, number];
      all?: never;
      any?: never;
      atLeast?: never;
    };

type EvaluationFallbackConditionGroup<CHILD_CONDITION> =
  | {
      question?: never;
      confidenceBelow?: never;
      probabilityBetween?: never;
      all: EvaluationFallbackConditionList<CHILD_CONDITION>;
      any?: never;
      atLeast?: never;
    }
  | {
      question?: never;
      confidenceBelow?: never;
      probabilityBetween?: never;
      all?: never;
      any: EvaluationFallbackConditionList<CHILD_CONDITION>;
      atLeast?: never;
    }
  | {
      question?: never;
      confidenceBelow?: never;
      probabilityBetween?: never;
      all?: never;
      any?: never;
      atLeast: {
        count: number;
        conditions: EvaluationFallbackConditionList<CHILD_CONDITION>;
      };
    };

type EvaluationFallbackConditionList<CONDITION> = readonly [
  CONDITION,
  ...CONDITION[],
];

type EvaluationFallbackConditionAtDepth4<QUESTION_ID extends string> =
  EvaluationFallbackDirectCondition<QUESTION_ID>;

type EvaluationFallbackConditionAtDepth3<QUESTION_ID extends string> =
  | EvaluationFallbackDirectCondition<QUESTION_ID>
  | EvaluationFallbackConditionGroup<
      EvaluationFallbackConditionAtDepth4<QUESTION_ID>
    >;

type EvaluationFallbackConditionAtDepth2<QUESTION_ID extends string> =
  | EvaluationFallbackDirectCondition<QUESTION_ID>
  | EvaluationFallbackConditionGroup<
      EvaluationFallbackConditionAtDepth3<QUESTION_ID>
    >;

type EvaluationFallbackConditionAtDepth1<QUESTION_ID extends string> =
  | EvaluationFallbackDirectCondition<QUESTION_ID>
  | EvaluationFallbackConditionGroup<
      EvaluationFallbackConditionAtDepth2<QUESTION_ID>
    >;

type ConditionalGatewayModelFallback<QUESTION_ID extends string> = Exclude<
  GatewayModelFallback<QUESTION_ID>,
  string
>;

type GatewayModelFallbackList<QUESTION_ID extends string> =
  | string[]
  | [ConditionalGatewayModelFallback<QUESTION_ID>, ...string[]];

const probabilitySchema = z.number().finite().min(0).max(1);
const questionSchema = z.string().min(1);
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

const conditionalModelFallbackSchema = z
  .object({
    model: z.string().min(1),
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
    return directConditionSchema;
  }

  const childConditionSchema = conditionSchema(depth + 1);
  const conditionListSchema = z.array(childConditionSchema).min(1);

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
