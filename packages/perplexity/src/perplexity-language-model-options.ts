import { z } from 'zod/v4';

const userLocationSchema = z.looseObject({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
});

const webSearchFiltersSchema = z.looseObject({
  search_domain_filter: z.array(z.string()).optional(),
  search_recency_filter: z
    .enum(['hour', 'day', 'week', 'month', 'year'])
    .optional(),
  search_after_date_filter: z.string().optional(),
  search_before_date_filter: z.string().optional(),
  last_updated_after_filter: z.string().optional(),
  last_updated_before_filter: z.string().optional(),
});

const webSearchToolSchema = z.looseObject({
  type: z.literal('web_search'),
  filters: webSearchFiltersSchema.optional(),
  max_results: z.number().int().positive().optional(),
  max_tokens: z.number().optional(),
  max_tokens_per_page: z.number().optional(),
  search_context_size: z.enum(['low', 'medium', 'high']).optional(),
  user_location: userLocationSchema.optional(),
});

const nativeToolSchema = z.union([
  webSearchToolSchema,
  z.looseObject({
    type: z.literal('fetch_url'),
    max_urls: z.number().optional(),
  }),
  z.looseObject({ type: z.literal('people_search') }),
  z.looseObject({ type: z.literal('finance_search') }),
  z.looseObject({ type: z.literal('sandbox') }),
  z.looseObject({
    type: z.literal('mcp'),
    server_label: z.string(),
    server_url: z.string(),
    allowed_tools: z.array(z.string()).optional(),
    authorization: z.string().optional(),
    defer_loading: z.boolean().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  z.looseObject({
    type: z.literal('connector'),
    id: z.string(),
    server_label: z.string(),
    server_description: z.string().optional(),
    allowed_tools: z.array(z.string()).optional(),
  }),
]);

export const perplexityLanguageModelOptions = z.looseObject({
  /** Top-level Agent API instructions. */
  instructions: z.string().optional(),

  /**
   * Native Agent API tools. AI SDK function tools can also be supplied through
   * the top-level `tools` option on `generateText` and `streamText`.
   */
  tools: z.array(nativeToolSchema).optional(),

  /** A fallback model list for Agent API routing. */
  models: z.array(z.string()).optional(),

  /** Maximum number of agentic steps. */
  max_steps: z.number().int().positive().optional(),

  /** Maximum number of native tool calls. */
  max_tool_calls: z.number().int().nonnegative().optional(),

  /** Continue a conversation from an earlier Agent API response. */
  previous_response_id: z.string().optional(),

  /** Whether Perplexity should store the response. */
  store: z.boolean().optional(),

  /** Preferred response language as an ISO 639-1 language code. */
  language_preference: z.string().optional(),

  /** Agent API reasoning configuration. */
  reasoning: z
    .looseObject({
      effort: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
    })
    .optional(),

  /** Agent API skill configuration. */
  skills: z
    .array(
      z.union([
        z.looseObject({
          type: z.literal('builtin'),
          name: z.enum([
            'office',
            'office/docx',
            'office/pdf',
            'office/pptx',
            'office/xlsx',
          ]),
        }),
        z.looseObject({
          type: z.literal('inline'),
          name: z.string(),
          description: z.string(),
          instructions: z.string(),
        }),
      ]),
    )
    .optional(),

  // Legacy Sonar options. These are mapped or warned about by the provider so
  // existing applications get an actionable migration path.
  search_recency_filter: z
    .enum(['hour', 'day', 'week', 'month', 'year'])
    .optional(),
  search_domain_filter: z.array(z.string()).optional(),
  search_language_filter: z.array(z.string()).optional(),
  search_after_date_filter: z.string().optional(),
  search_before_date_filter: z.string().optional(),
  last_updated_after_filter: z.string().optional(),
  last_updated_before_filter: z.string().optional(),
  num_search_results: z.number().int().positive().optional(),
  search_mode: z.enum(['web', 'academic', 'sec']).optional(),
  enable_search_classifier: z.boolean().optional(),
  disable_search: z.boolean().optional(),
  return_related_questions: z.boolean().optional(),
  return_images: z.boolean().optional(),
  image_domain_filter: z.array(z.string()).optional(),
  image_format_filter: z.array(z.string()).optional(),
  media_response: z.looseObject({}).optional(),
  stream_mode: z.enum(['full', 'concise']).optional(),
  reasoning_effort: z
    .enum(['minimal', 'low', 'medium', 'high', 'xhigh'])
    .optional(),
  web_search_options: z
    .looseObject({
      search_context_size: z.enum(['low', 'medium', 'high']).optional(),
      search_type: z.enum(['fast', 'pro', 'auto']).optional(),
      user_location: userLocationSchema.optional(),
      image_results_enhanced_relevance: z.boolean().optional(),
    })
    .optional(),
});

export type PerplexityLanguageModelOptions = z.infer<
  typeof perplexityLanguageModelOptions
>;
