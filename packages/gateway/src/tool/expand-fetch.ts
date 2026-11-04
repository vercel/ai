import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';

export type ExpandFetchAppendixMarkers = 'off' | 'compact' | 'detailed';

export type ExpandFetchSnippetSource = 'markdown' | 'appendix' | 'statejson';

export type ExpandFetchOriginErrorKind =
  | 'http'
  | 'dns'
  | 'tls'
  | 'connectionRefused'
  | 'connectionReset'
  | 'connectionClosed'
  | 'addressUnreachable'
  | 'emptyResponse'
  | 'connectionTimeout';

export interface ExpandFetchHighlightsConfig {
  /** Maximum number of Highlights snippets to return (1-50, default: 5). */
  maxResults?: number;
  /** Minimum relevance score from 0 to 1 (default: 0, no filtering). */
  minScore?: number;
}

export interface ExpandFetchConfig {
  /** Include page metadata such as description, author, and Open Graph tags (default: false). */
  includeMeta?: boolean;
  /** Include State JSON, the hidden data behind the page (default: true). */
  includeJson?: boolean;
  /** Include the Appendix: navigation, footer, and related-content links moved out of the Main Markdown (default: false). */
  includeAppendix?: boolean;
  /** How to mark where Appendix content was removed from the Main Markdown (default: compact). */
  appendixMarkers?: ExpandFetchAppendixMarkers;
  /** Scroll the whole page before capture so lazy-loaded content is included (default: false). */
  scrollFullPage?: boolean;
  /** Defaults for Highlights when the model asks for relevant passages. */
  highlights?: ExpandFetchHighlightsConfig;
}

export interface ExpandFetchInput {
  /** URL of the page to fetch (http or https). */
  url: string;
  /** Return only the passages relevant to a query. Use it on long pages when you need specific facts. */
  highlights?: {
    /** Query to find relevant passages. */
    query: string;
    /** Maximum number of snippets to return (1-50). */
    max_results?: number;
    /** Minimum relevance score from 0 to 1. */
    min_score?: number;
  };
  /** Include page metadata such as description, author, and Open Graph tags. */
  include_meta?: boolean;
  /** Include the Appendix: navigation, footer, and related-content links moved out of the Main Markdown. */
  include_appendix?: boolean;
  /** Include State JSON, the hidden data behind the page such as prices, chart values, and API responses. */
  include_json?: boolean;
}

export interface ExpandFetchMeta {
  /** Response schema version. */
  version: number;
  /** Requested URL. */
  url: string;
  /** URL after redirects. */
  finalUrl?: string;
  /** Page title. */
  title?: string;
  /** Page description from meta tags. */
  description?: string;
  /** Detected page language. */
  lang: string;
  /** Classified page type, for example article or product. */
  pageType: string;
  /** MIME type of the origin response, for example text/html or application/pdf. */
  contentType?: string;
  /** Capture time as an ISO 8601 timestamp. */
  capturedAt: string;
  /** Link to the saved Snapshot of the page. Opens without an Expand account. */
  playground: string;
  /** Evidence IDs of the lines most worth citing. Each resolves at `{playground}?id={id}`. */
  citationEvidenceIds?: number[];
  /** With Highlights, where to fetch the full Markdown of the page. */
  markdown?: {
    url: string;
  };
}

export interface ExpandFetchSnippet {
  /** Where the snippet came from. */
  source: ExpandFetchSnippetSource;
  /** Snippet text. */
  text: string;
  /** Relevance score from 0 to 1. */
  score: number;
  /** For State JSON snippets, the extracted value. */
  json?: unknown;
  location?: {
    /** Evidence ID of the snippet. Resolves at `{meta.playground}?id={evidenceId}`. */
    evidenceId?: number;
  };
}

export interface ExpandFetchResponse {
  /** Page metadata and the public Snapshot link. */
  meta: ExpandFetchMeta;
  /** The Main Markdown. The page content, with navigation and footers moved to the Appendix. Empty when Highlights ran on a web page. */
  markdown: string;
  /** State JSON entries, one per piece of evidence. Empty when State JSON is off. */
  json: unknown[];
  data?: {
    /** Highlights for the requested query. */
    highlights?: {
      query: string;
      snippets: ExpandFetchSnippet[];
    };
  };
  /**
   * Present when the site answered with an HTTP error status, such as 404,
   * but still served a page. The captured content is returned alongside it.
   */
  originError?: {
    _tag: 'FetchOriginError';
    /** Requested URL. */
    url: string;
    kind: 'http';
    /** HTTP status returned by the site. */
    originStatusCode: number;
    /** URL after redirects, when the site redirected. */
    finalUrl?: string;
    /** Whether the same request may succeed on retry. */
    retryable: boolean;
  };
}

/** The target site could not be reached or returned an error status. */
export interface ExpandFetchOriginError {
  _tag: 'FetchOriginError';
  /** Requested URL. */
  url: string;
  /** `http` when the origin returned an error status, otherwise the network condition that prevented a response. */
  kind: ExpandFetchOriginErrorKind;
  /** HTTP status returned by the origin, when there was one. */
  originStatusCode?: number;
  /** URL after redirects, when the origin redirected. */
  finalUrl?: string;
  /** Underlying network error, when recorded. */
  upstreamError?: string;
  /** Whether the same request may succeed on retry. */
  retryable: boolean;
}

/** The Gateway or Expand API could not run the fetch. */
export interface ExpandFetchError {
  error:
    | 'api_error'
    | 'configuration_error'
    | 'execution_error'
    | 'invalid_input'
    | 'rate_limit'
    | 'timeout'
    | 'unknown';
  statusCode?: number;
  message: string;
}

export type ExpandFetchOutput =
  | ExpandFetchError
  | ExpandFetchOriginError
  | ExpandFetchResponse;

const expandFetchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      url: z
        .string()
        .url()
        .describe('URL of the page to fetch (http or https).'),
      highlights: z
        .object({
          query: z.string().describe('Query to find relevant passages.'),
          max_results: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe(
              'Maximum number of snippets to return (1-50, default: 5).',
            ),
          min_score: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe(
              'Minimum relevance score from 0 to 1 (default: 0, no filtering).',
            ),
        })
        .optional()
        .describe(
          'Return only the passages relevant to a query. Use it on long pages when you need specific facts.',
        ),
      include_meta: z
        .boolean()
        .optional()
        .describe(
          'Include page metadata such as description, author, and Open Graph tags (default: false).',
        ),
      include_appendix: z
        .boolean()
        .optional()
        .describe(
          'Include the Appendix: navigation, footer, and related-content links moved out of the Main Markdown (default: false).',
        ),
      include_json: z
        .boolean()
        .optional()
        .describe(
          'Include State JSON, the hidden data behind the page such as prices, chart values, and API responses (default: true).',
        ),
    }),
  ),
);

const expandFetchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        meta: z.object({
          version: z.number(),
          url: z.string(),
          finalUrl: z.string().optional(),
          title: z.string().optional(),
          description: z.string().optional(),
          lang: z.string(),
          pageType: z.string(),
          contentType: z.string().optional(),
          capturedAt: z.string(),
          playground: z.string(),
          citationEvidenceIds: z.array(z.number()).optional(),
          markdown: z.object({ url: z.string() }).optional(),
        }),
        markdown: z.string(),
        json: z.array(z.unknown()),
        data: z
          .object({
            highlights: z
              .object({
                query: z.string(),
                snippets: z.array(
                  z.object({
                    source: z.enum(['markdown', 'appendix', 'statejson']),
                    text: z.string(),
                    score: z.number(),
                    json: z.unknown().optional(),
                    location: z
                      .object({ evidenceId: z.number().optional() })
                      .optional(),
                  }),
                ),
              })
              .optional(),
          })
          .optional(),
        originError: z
          .object({
            _tag: z.literal('FetchOriginError'),
            url: z.string(),
            kind: z.literal('http'),
            originStatusCode: z.number(),
            finalUrl: z.string().optional(),
            retryable: z.boolean(),
          })
          .optional(),
      }),
      z.object({
        _tag: z.literal('FetchOriginError'),
        url: z.string(),
        kind: z.enum([
          'http',
          'dns',
          'tls',
          'connectionRefused',
          'connectionReset',
          'connectionClosed',
          'addressUnreachable',
          'emptyResponse',
          'connectionTimeout',
        ]),
        originStatusCode: z.number().optional(),
        finalUrl: z.string().optional(),
        upstreamError: z.string().optional(),
        retryable: z.boolean(),
      }),
      z.object({
        error: z.enum([
          'api_error',
          'configuration_error',
          'execution_error',
          'invalid_input',
          'rate_limit',
          'timeout',
          'unknown',
        ]),
        statusCode: z.number().optional(),
        message: z.string(),
      }),
    ]),
  ),
);

export const expandFetchToolFactory = createProviderExecutedToolFactory<
  ExpandFetchInput,
  ExpandFetchOutput,
  ExpandFetchConfig
>({
  id: 'gateway.expand_fetch',
  inputSchema: expandFetchInputSchema,
  outputSchema: expandFetchOutputSchema,
});

export const expandFetch = (
  config: ExpandFetchConfig = {},
): ReturnType<typeof expandFetchToolFactory> => expandFetchToolFactory(config);
