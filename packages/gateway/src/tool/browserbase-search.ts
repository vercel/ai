import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';

export interface BrowserbaseSearchConfig {
  /**
   * Default maximum number of results to return (1-25, default: 10).
   */
  numResults?: number;
}

export interface BrowserbaseSearchInput {
  /**
   * Web search query (1-200 characters).
   */
  query: string;

  /**
   * Maximum number of results to return (1-25, default: 10).
   */
  num_results?: number;
}

export interface BrowserbaseSearchResult {
  /** Unique identifier for the result. */
  id: string;
  /** Title of the search result. */
  title: string;
  /** URL of the search result. */
  url: string;
  /** Author of the content, when available. */
  author?: string;
  /** Favicon URL, when available. */
  favicon?: string;
  /** Image URL, when available. */
  image?: string;
  /** Publication date in ISO 8601 format, when available. */
  publishedDate?: string;
}

export interface BrowserbaseSearchResponse {
  /** The search query that was executed. */
  query: string;
  /** Unique identifier for the request. */
  requestId: string;
  /** Search results. */
  results: BrowserbaseSearchResult[];
}

export interface BrowserbaseSearchError {
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

export type BrowserbaseSearchOutput =
  | BrowserbaseSearchError
  | BrowserbaseSearchResponse;

const browserbaseSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      query: z
        .string()
        .min(1)
        .max(200)
        .describe('Web search query. Must be between 1 and 200 characters.'),
      num_results: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe('Maximum number of results to return (1-25, default: 10).'),
    }),
  ),
);

const browserbaseSearchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        query: z.string(),
        requestId: z.string(),
        results: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            url: z.string(),
            author: z.string().optional(),
            favicon: z.string().optional(),
            image: z.string().optional(),
            publishedDate: z.string().optional(),
          }),
        ),
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

export const browserbaseSearchToolFactory = createProviderExecutedToolFactory<
  BrowserbaseSearchInput,
  BrowserbaseSearchOutput,
  BrowserbaseSearchConfig
>({
  id: 'gateway.browserbase_search',
  inputSchema: browserbaseSearchInputSchema,
  outputSchema: browserbaseSearchOutputSchema,
});

export const browserbaseSearch = (
  config: BrowserbaseSearchConfig = {},
): ReturnType<typeof browserbaseSearchToolFactory> =>
  browserbaseSearchToolFactory(config);
