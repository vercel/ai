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
  /** Agent API search path. `fast` is the lower-latency path; `web` is standard search. */
  search_type: z.enum(['web', 'fast']).optional(),
  user_location: userLocationSchema.optional(),
});

const imageSearchToolSchema = z.looseObject({
  type: z.literal('image_search'),
  max_results: z.number().int().min(1).max(30).optional(),
  filters: z
    .looseObject({
      domain_filter: z.array(z.string()).max(10).optional(),
      format_filter: z
        .array(z.enum(['bmp', 'gif', 'jpeg', 'png', 'webp', 'svg']))
        .max(10)
        .optional(),
      safe_search: z.boolean().optional(),
    })
    .optional(),
});

const webSearchOptionsSchema = z.object({
  /** Amount of search context to include. Maps to `search_context_size`. */
  searchContextSize: z.enum(['low', 'medium', 'high']).optional(),
  /** Sonar search type: `fast`, `pro`, or `auto`. Maps to `web_search_options.search_type`. */
  searchType: z.enum(['fast', 'pro', 'auto']).optional(),
  /** Search location. Maps to `user_location`. */
  userLocation: userLocationSchema.optional(),
  /** Enhanced relevance filtering for image results. */
  imageResultsEnhancedRelevance: z.boolean().optional(),
});

const nativeToolSchema = z.union([
  webSearchToolSchema,
  imageSearchToolSchema,
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

  /**
   * Whether the response can be retrieved later. Setting this to false does
   * not disable persistence or prevent previous_response_id continuations.
   */
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

  /** Source of search results. Maps to `search_mode`. */
  searchMode: z.enum(['web', 'academic', 'sec']).optional(),

  /** Web search configuration. Maps to `web_search_options`. */
  webSearchOptions: webSearchOptionsSchema.optional(),

  /** Include image results. Maps to `return_images`. */
  returnImages: z.boolean().optional(),

  /** Include suggested follow-up questions. Maps to `return_related_questions`. */
  returnRelatedQuestions: z.boolean().optional(),

  /** Let a classifier decide whether to search. Maps to `enable_search_classifier`. */
  enableSearchClassifier: z.boolean().optional(),

  /** Disable web search. Maps to `disable_search`. */
  disableSearch: z.boolean().optional(),

  /** Limit results to these domains. Maps to `search_domain_filter`. */
  searchDomainFilter: z.array(z.string()).optional(),

  /** Filter results by ISO 639-1 language codes. Maps to `search_language_filter`. */
  searchLanguageFilter: z.array(z.string()).optional(),

  /** Filter results by publication recency. Maps to `search_recency_filter`. */
  searchRecencyFilter: z
    .enum(['hour', 'day', 'week', 'month', 'year'])
    .optional(),

  /** Include results published after this date (`MM/DD/YYYY`). */
  searchAfterDateFilter: z.string().optional(),

  /** Include results published before this date (`MM/DD/YYYY`). */
  searchBeforeDateFilter: z.string().optional(),

  /** Include results last updated after this date (`MM/DD/YYYY`). */
  lastUpdatedAfterFilter: z.string().optional(),

  /** Include results last updated before this date (`MM/DD/YYYY`). */
  lastUpdatedBeforeFilter: z.string().optional(),

  /** Limit image results to these formats. Maps to `image_format_filter`. */
  imageFormatFilter: z.array(z.string()).optional(),

  /** Limit image results to these domains. Maps to `image_domain_filter`. */
  imageDomainFilter: z.array(z.string()).optional(),

  /** Streaming event format. Maps to `stream_mode`. */
  streamMode: z.enum(['full', 'concise']).optional(),

  /** Reasoning effort. Maps to `reasoning_effort`. */
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
});

export type PerplexityLanguageModelOptions = z.infer<
  typeof perplexityLanguageModelOptions
>;

function definedRecord(
  entries: Array<[string, unknown]>,
): Record<string, unknown> {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

const chatCompletionOptionKeys = [
  'searchMode',
  'webSearchOptions',
  'returnImages',
  'returnRelatedQuestions',
  'enableSearchClassifier',
  'disableSearch',
  'searchDomainFilter',
  'searchLanguageFilter',
  'searchRecencyFilter',
  'searchAfterDateFilter',
  'searchBeforeDateFilter',
  'lastUpdatedAfterFilter',
  'lastUpdatedBeforeFilter',
  'imageFormatFilter',
  'imageDomainFilter',
  'streamMode',
  'reasoningEffort',
] as const satisfies ReadonlyArray<keyof PerplexityLanguageModelOptions>;

/**
 * SDK chat options are camelCase. Perplexity chat completion fields are snake_case
 * and are forwarded on the request.
 */
function perplexityChatCompletionFields(
  options: PerplexityLanguageModelOptions,
): Record<string, unknown> {
  const webSearchOptions =
    options.webSearchOptions == null
      ? undefined
      : definedRecord([
          ['search_context_size', options.webSearchOptions.searchContextSize],
          ['search_type', options.webSearchOptions.searchType],
          ['user_location', options.webSearchOptions.userLocation],
          [
            'image_results_enhanced_relevance',
            options.webSearchOptions.imageResultsEnhancedRelevance,
          ],
        ]);

  return definedRecord([
    ['search_mode', options.searchMode],
    [
      'web_search_options',
      webSearchOptions != null && Object.keys(webSearchOptions).length > 0
        ? webSearchOptions
        : undefined,
    ],
    ['return_images', options.returnImages],
    ['return_related_questions', options.returnRelatedQuestions],
    ['enable_search_classifier', options.enableSearchClassifier],
    ['disable_search', options.disableSearch],
    ['search_domain_filter', options.searchDomainFilter],
    ['search_language_filter', options.searchLanguageFilter],
    ['search_recency_filter', options.searchRecencyFilter],
    ['search_after_date_filter', options.searchAfterDateFilter],
    ['search_before_date_filter', options.searchBeforeDateFilter],
    ['last_updated_after_filter', options.lastUpdatedAfterFilter],
    ['last_updated_before_filter', options.lastUpdatedBeforeFilter],
    ['image_format_filter', options.imageFormatFilter],
    ['image_domain_filter', options.imageDomainFilter],
    ['stream_mode', options.streamMode],
    ['reasoning_effort', options.reasoningEffort],
  ]);
}

export function splitPerplexityLanguageModelOptions(
  options: PerplexityLanguageModelOptions,
): {
  agentOptions: Record<string, unknown>;
  nativeTools: PerplexityLanguageModelOptions['tools'];
  chatCompletion: Record<string, unknown>;
} {
  const agentOptions: Record<string, unknown> = { ...options };
  for (const key of chatCompletionOptionKeys) {
    delete agentOptions[key];
  }
  delete agentOptions.tools;

  return {
    agentOptions,
    nativeTools: options.tools,
    chatCompletion: perplexityChatCompletionFields(options),
  };
}
