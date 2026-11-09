import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://vercel.com/docs/ai-gateway/provider-options
const gatewayProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Array of provider slugs that are the only ones allowed to be used.
       *
       * Example: `['azure', 'openai']` will only allow Azure and OpenAI to be used.
       */
      only: z.array(z.string()).optional(),
      /**
       * Array of provider slugs that specifies the sequence in which providers should be attempted.
       *
       * Example: `['bedrock', 'anthropic']` will try Amazon Bedrock first, then Anthropic as fallback.
       */
      order: z.array(z.string()).optional(),
      /**
       * Sort providers by a performance or cost metric before routing.
       *
       * - `'cost'`: lowest cost first
       * - `'ttft'`: lowest time-to-first-token first
       * - `'tps'`: highest tokens-per-second first
       */
      sort: z.enum(['cost', 'ttft', 'tps']).optional(),
      /**
       * The unique identifier for the end user on behalf of whom the request was made.
       *
       * Used for spend tracking and attribution purposes.
       */
      user: z.string().optional(),
      /**
       * User-specified tags for use in reporting and filtering usage.
       *
       * For example, spend tracking reporting by feature or prompt version.
       *
       * Example: `['chat', 'v2']`
       */
      tags: z.array(z.string()).optional(),
      /**
       * Array of model slugs specifying fallback models to use in order.
       *
       * Example: `['openai/gpt-5-nano', 'zai/glm-4.6']` will try `openai/gpt-5-nano` first, then `zai/glm-4.6` as fallback.
       */
      models: z.array(z.string()).optional(),
      /**
       * Request-scoped BYOK credentials to use instead of cached credentials.
       *
       * When provided, cached BYOK credentials are ignored entirely.
       *
       * Each provider can have multiple credentials (tried in order).
       *
       * Examples:
       * - Simple: `{ 'anthropic': [{ apiKey: 'sk-ant-...' }] }`
       * - Multiple: `{ 'vertex': [{ projectId: 'proj-1', privateKey: '...' }, { projectId: 'proj-2', privateKey: '...' }] }`
       * - Multi-provider: `{ 'anthropic': [{ apiKey: '...' }], 'bedrock': [{ accessKeyId: '...', secretAccessKey: '...' }] }`
       */
      byok: z
        .record(z.string(), z.array(z.record(z.string(), z.unknown())))
        .optional(),
      /**
       * Whether to filter by only providers that state they have zero data
       * retention with Vercel AI Gateway. When enabled, only providers that
       * have agreements with Vercel AI Gateway for zero data retention will be
       * used.
       */
      zeroDataRetention: z.boolean().optional(),
      /**
       * Whether to filter by only providers that do not train on prompt data.
       * When enabled, only providers that have agreements with Vercel AI Gateway
       * to not use prompts for model training will be used.
       */
      disallowPromptTraining: z.boolean().optional(),
      /**
       * The unique identifier for the entity against which quota is tracked.
       *
       * Used for quota management and enforcement purposes.
       */
      quotaEntityId: z.string().optional(),
      /**
       * Per-provider timeouts for BYOK credentials in milliseconds.
       * Controls how long to wait for a provider to start responding
       * before falling back to the next available provider.
       *
       * Example: `{ byok: { openai: 5000, anthropic: 2000 } }`
       */
      providerTimeouts: z
        .object({
          byok: z.record(z.string(), z.number().int().min(1000)).optional(),
        })
        .optional(),
      /**
       * Unified service tier intent. Translated by the gateway into the
       * per-provider option each provider expects, and overrides any tier
       * also set in the per-provider options. Leave unset for provider
       * default.
       */
      serviceTier: z.enum(['flex', 'priority']).optional(),
      /**
       * Enables automatic prompt caching across providers. When set to
       * `'auto'`, the gateway applies the appropriate caching strategy for
       * the routed provider: it adds a `cache_control` breakpoint to static
       * content for providers that require explicit markers (such as
       * Anthropic), while providers with implicit caching cache
       * automatically. Leave unset to pass requests through unmodified.
       */
      caching: z.literal('auto').optional(),
      /**
       * Restrict routing to provider models that satisfy every given entry:
       *
       * - `'implicit-caching'`: models that perform automatic (implicit)
       *   prompt caching
       * - `'reasoning'`: models that support reasoning
       * - `'structured-output'`: models that support schema-constrained output
       * - `'tool-use'`: models that support tool calling
       * - `'vision'`: models that accept image input
       * - `'quantization:<value>'`: providers serving that weight format
       * - `'!quantization:<value>'`: exclude providers serving that weight
       *   format (providers with no recorded format still pass an exclusion)
       *
       * The capability is a property of the model, so the filter applies to
       * both BYOK and system credentials. If no provider model for the
       * requested model satisfies the capabilities, the request fails.
       */
      has: z
        .array(
          z.union([
            z.enum([
              'implicit-caching',
              'reasoning',
              'structured-output',
              'tool-use',
              'vision',
            ]),
            z.templateLiteral(['quantization:', z.string()]),
            z.templateLiteral(['!quantization:', z.string()]),
          ]),
        )
        .optional(),
    }),
  ),
);

<<<<<<< HEAD
export type GatewayProviderOptions = InferSchema<typeof gatewayProviderOptions>;
=======
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

const probabilitySchema = () => z.number().finite().min(0).max(1);
const questionSchema = () =>
  z.string().min(1).max(DECISION_FALLBACK_MAX_QUESTION_LENGTH);
const directConditionSchema = () =>
  z.union([
    z
      .object({
        question: questionSchema().optional(),
        confidenceBelow: probabilitySchema(),
      })
      .strict(),
    z
      .object({
        question: questionSchema().optional(),
        probabilityBetween: z
          .array(probabilitySchema())
          .length(2)
          .refine(([minimum, maximum]) => minimum <= maximum, {
            message:
              'probabilityBetween minimum must be less than or equal to maximum',
          }),
      })
      .strict(),
  ]) as ZodType<DecisionFallbackCondition>;

const groupBeyondMaxDepthSchema = () =>
  z
    .union([
      z.object({ any: z.unknown() }),
      z.object({ all: z.unknown() }),
      z.object({ atLeast: z.unknown() }),
    ])
    .superRefine((_, context) => {
      context.addIssue({
        code: 'custom',
        message: `conditions can be nested at most ${DECISION_FALLBACK_MAX_CONDITION_DEPTH} levels deep`,
      });
    });

const conditionalModelFallbackSchema = () =>
  z
    .object({
      model: z.string().min(1),
      when: conditionSchema(1),
    })
    .strict();

const gatewayModelFallbacksSchema = () =>
  z
    .array(z.union([z.string(), conditionalModelFallbackSchema()]))
    .superRefine((entries, context) => {
      const conditionalIndexes = entries.flatMap((entry, index) =>
        typeof entry === 'string' ? [] : [index],
      );
      if (conditionalIndexes.length > 1) {
        context.addIssue({
          code: 'custom',
          message: 'models supports at most one conditional decision fallback',
        });
      }
      if (conditionalIndexes[0] !== undefined && conditionalIndexes[0] !== 0) {
        context.addIssue({
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
    .min(1)
    .max(DECISION_FALLBACK_MAX_CONDITIONS_PER_LIST);

  return z.union([
    directConditionSchema(),
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
  ]) as ZodType<DecisionFallbackCondition>;
}
>>>>>>> 44db2252f0 (feat(provider/gateway): type the headquarters provider option (#24740))
