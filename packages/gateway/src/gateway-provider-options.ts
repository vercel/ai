import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import type { ZodMiniType as ZodType } from 'zod/v4/mini';
import { z } from './zod';

// https://vercel.com/docs/ai-gateway/provider-options
export const DECISION_FALLBACK_MAX_CONDITION_DEPTH = 5;
export const DECISION_FALLBACK_MAX_CONDITIONS_PER_LIST = 20;
export const DECISION_FALLBACK_MAX_QUESTION_LENGTH = 256;

export const gatewayDecisionProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.catchall(
      z.object({
        models: z.optional(gatewayModelFallbacksSchema()),
      }),
      z.unknown(),
    ),
  ),
);

/**
 * A condition on the primary model's answers. `QUESTION_ID` narrows
 * `question` to your question IDs. Without `question`, `confidenceBelow`
 * checks every Choice and Score question and `probabilityBetween` every
 * Boolean question. Groups nest at most five levels deep, which the SDK
 * checks at runtime.
 */
export type DecisionFallbackCondition<QUESTION_ID extends string = string> =
  | ExclusiveCondition<{ question?: QUESTION_ID; confidenceBelow: number }>
  | ExclusiveCondition<{
      question?: QUESTION_ID;
      probabilityBetween: [number, number];
    }>
  | ExclusiveCondition<{ any: DecisionFallbackConditionList<QUESTION_ID> }>
  | ExclusiveCondition<{ all: DecisionFallbackConditionList<QUESTION_ID> }>
  | ExclusiveCondition<{
      atLeast: {
        count: number;
        conditions: DecisionFallbackConditionList<QUESTION_ID>;
      };
    }>;

export type GatewayModelFallback<QUESTION_ID extends string = string> =
  | string
  | {
      model: string;
      when: DecisionFallbackCondition<QUESTION_ID>;
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

  /**
   * Experimental, image models only: decode large base64 images while reading
   * the response to reduce peak memory. Extracted images are returned as bytes;
   * if a result mixes extracted and small images, all are returned as bytes.
   * Defaults to false. Image models remove this client option from requests.
   */
  experimental_streamingImageDecoding?: boolean;

  /** Filter to providers that do not train on prompt data. */
  disallowPromptTraining?: boolean;

  /**
   * Route only to providers headquartered in these countries (ISO 3166-1
   * alpha-2 codes, e.g. `['US', 'DE']`), or prefix every code with `!` to
   * exclude countries instead (e.g. `['!US']`). A list can't mix the two.
   */
  headquarters?: string[];

  /**
   * Restrict routing to provider models that satisfy every given entry.
   *
   * Entries are capability tags (`'implicit-caching'`, `'reasoning'`,
   * `'tool-use'`, `'vision'` (image input), `'structured-output'`
   * (schema-constrained output)) or weight-format conditions:
   * `'quantization:fp8'` requires the serving provider to report that weight
   * format, `'!quantization:fp8'` excludes it (providers with no recorded
   * format still pass an exclusion). Format values are an open space but must
   * match `[a-zA-Z0-9._-]{1,32}` and compare case-insensitively. Unknown
   * capability names are rejected by the Gateway with a 400.
   */
  has?: Array<
    | 'implicit-caching'
    | 'reasoning'
    | 'structured-output'
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
   * Fallback models to try in order. On decision requests, the first entry
   * can be a conditional `{ model, when }` fallback that reruns the decision
   * when `when` matches the primary answers. Other request types reject a
   * conditional entry. Pass your question IDs as `QUESTION_ID` to check the
   * `question` names in `when`.
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

  /**
   * Assert that the request reached the matching regional ingress hostname.
   * Defaults inference only when the Gateway has no effective inference-region
   * policy, including normalized provider-specific settings. Not a full residency assertion.
   * `pinInference: false` disables only this default, not the ingress assertion
   * or any explicit, team, or model-configuration inference constraints.
   * This option is forwarded to the Gateway and never changes the request URL.
   * Requires Gateway support on synchronous HTTP inference routes; older
   * deployments may ignore it. Not an assertion for WebSocket or batch requests.
   */
  regionalHosting?:
    | 'au'
    | 'eu'
    | 'us'
    | { region: 'au' | 'eu' | 'us'; pinInference?: boolean };

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

type DecisionFallbackConditionList<QUESTION_ID extends string> = [
  DecisionFallbackCondition<QUESTION_ID>,
  ...DecisionFallbackCondition<QUESTION_ID>[],
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

type ConditionalGatewayModelFallback<QUESTION_ID extends string> = Exclude<
  GatewayModelFallback<QUESTION_ID>,
  string
>;

type GatewayModelFallbackList<QUESTION_ID extends string> =
  | string[]
  | [ConditionalGatewayModelFallback<QUESTION_ID>, ...string[]];

const probabilitySchema = () =>
  z.number().check(z.minimum(0)).check(z.maximum(1));
const questionSchema = () =>
  z
    .string()
    .check(z.minLength(1))
    .check(z.maxLength(DECISION_FALLBACK_MAX_QUESTION_LENGTH));
const directConditionSchema = () =>
  z.union([
    z.catchall(
      z.object({
        question: z.optional(questionSchema()),
        confidenceBelow: probabilitySchema(),
      }),
      z.never(),
    ),
    z.catchall(
      z.object({
        question: z.optional(questionSchema()),
        probabilityBetween: z
          .array(probabilitySchema())
          .check(z.length(2))
          .check(
            z.refine(([minimum, maximum]) => minimum <= maximum, {
              message:
                'probabilityBetween minimum must be less than or equal to maximum',
            }),
          ),
      }),
      z.never(),
    ),
  ]) as ZodType<DecisionFallbackCondition>;

const groupBeyondMaxDepthSchema = () =>
  z
    .union([
      z.object({ any: z.unknown() }),
      z.object({ all: z.unknown() }),
      z.object({ atLeast: z.unknown() }),
    ])
    .check(context => {
      context.issues.push({
        input: context.value,
        continue: true,
        code: 'custom',
        message: `conditions can be nested at most ${DECISION_FALLBACK_MAX_CONDITION_DEPTH} levels deep`,
      });
    });

const conditionalModelFallbackSchema = () =>
  z.catchall(
    z.object({
      model: z.string().check(z.minLength(1)),
      when: conditionSchema(1),
    }),
    z.never(),
  );

const gatewayModelFallbacksSchema = () =>
  z
    .array(z.union([z.string(), conditionalModelFallbackSchema()]))
    .check(context => {
      const entries = context.value;
      const conditionalIndexes = entries.flatMap((entry, index) =>
        typeof entry === 'string' ? [] : [index],
      );
      if (conditionalIndexes.length > 1) {
        context.issues.push({
          input: context.value,
          continue: true,
          code: 'custom',
          message: 'models supports at most one conditional decision fallback',
        });
      }
      if (conditionalIndexes[0] !== undefined && conditionalIndexes[0] !== 0) {
        context.issues.push({
          input: context.value,
          continue: true,
          code: 'custom',
          message:
            'a conditional decision fallback must be the first models entry',
          path: [conditionalIndexes[0]],
        });
      }
    });

function conditionSchema(depth: number): ZodType<DecisionFallbackCondition> {
  if (depth === DECISION_FALLBACK_MAX_CONDITION_DEPTH) {
    return z.union([
      directConditionSchema(),
      groupBeyondMaxDepthSchema(),
    ]) as ZodType<DecisionFallbackCondition>;
  }

  const childConditionSchema = conditionSchema(depth + 1);
  const conditionListSchema = z
    .array(childConditionSchema)
    .check(z.minLength(1))
    .check(z.maxLength(DECISION_FALLBACK_MAX_CONDITIONS_PER_LIST));

  return z.union([
    directConditionSchema(),
    z.catchall(z.object({ any: conditionListSchema }), z.never()),
    z.catchall(z.object({ all: conditionListSchema }), z.never()),
    z.catchall(
      z.object({
        atLeast: z
          .catchall(
            z.object({
              count: z.number().check(z.int()).check(z.minimum(1)),
              conditions: conditionListSchema,
            }),
            z.never(),
          )
          .check(
            z.refine(({ count, conditions }) => count <= conditions.length, {
              message: 'atLeast count cannot exceed the number of conditions',
              path: ['count'],
            }),
          ),
      }),
      z.never(),
    ),
  ]) as ZodType<DecisionFallbackCondition>;
}
