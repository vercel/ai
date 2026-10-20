import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from '../zod';

export type BrowserbaseFetchFormat = 'raw' | 'json' | 'markdown';

export interface BrowserbaseFetchConfig {
  /** Whether to follow HTTP redirects (default: false). */
  allowRedirects?: boolean;
  /** Whether to bypass TLS certificate verification (default: false). */
  allowInsecureSsl?: boolean;
  /** Whether to route the request through Browserbase proxies (default: false). */
  proxies?: boolean;
  /** Output format for the response content (default: raw). */
  format?: BrowserbaseFetchFormat;
  /**
   * JSON Schema describing the desired response content. Only used when format
   * is json.
   */
  schema?: Record<string, unknown>;
}

export interface BrowserbaseFetchInput {
  /** URL of the page to fetch. */
  url: string;
  /** Whether to follow HTTP redirects. */
  allow_redirects?: boolean;
  /** Whether to bypass TLS certificate verification. */
  allow_insecure_ssl?: boolean;
  /** Whether to route the request through Browserbase proxies. */
  proxies?: boolean;
  /** Output format for the response content. */
  format?: BrowserbaseFetchFormat;
  /**
   * JSON Schema describing the desired response content. Only used when format
   * is json.
   */
  schema?: Record<string, unknown>;
}

export interface BrowserbaseFetchResponse {
  /** Unique identifier for the fetch request. */
  id: string;
  /**
   * Response body. Raw and markdown responses return strings; JSON extraction
   * returns an object matching the requested schema.
   */
  content: string | Record<string, unknown>;
  /** MIME type of the response. */
  contentType: string;
  /** Character encoding of the response. */
  encoding: string;
  /** Response headers from the fetched page. */
  headers: Record<string, string>;
  /** HTTP status code returned by the fetched page. */
  statusCode: number;
}

export interface BrowserbaseFetchError {
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

export type BrowserbaseFetchOutput =
  | BrowserbaseFetchError
  | BrowserbaseFetchResponse;

const jsonObjectSchema = z.record(z.string(), z.unknown());

const browserbaseFetchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      url: z.string().url().describe('URL of the page to fetch.'),
      allow_redirects: z
        .boolean()
        .optional()
        .describe('Whether to follow HTTP redirects (default: false).'),
      allow_insecure_ssl: z
        .boolean()
        .optional()
        .describe(
          'Whether to bypass TLS certificate verification (default: false). Only use for trusted hosts.',
        ),
      proxies: z
        .boolean()
        .optional()
        .describe(
          'Whether to route the request through Browserbase proxies (default: false).',
        ),
      format: z
        .enum(['raw', 'json', 'markdown'])
        .optional()
        .describe(
          'Output format. raw returns the response body unchanged, markdown returns page content as Markdown, and json returns structured content using schema.',
        ),
      schema: jsonObjectSchema
        .optional()
        .describe(
          'JSON Schema for structured extraction. Only use with format set to json.',
        ),
    }),
  ),
);

const browserbaseFetchOutputSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        id: z.string(),
        content: z.union([z.string(), jsonObjectSchema]),
        contentType: z.string(),
        encoding: z.string(),
        headers: z.record(z.string(), z.string()),
        statusCode: z.number(),
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

export const browserbaseFetchToolFactory = createProviderExecutedToolFactory<
  BrowserbaseFetchInput,
  BrowserbaseFetchOutput,
  BrowserbaseFetchConfig
>({
  id: 'gateway.browserbase_fetch',
  inputSchema: browserbaseFetchInputSchema,
  outputSchema: browserbaseFetchOutputSchema,
});

export const browserbaseFetch = (
  config: BrowserbaseFetchConfig = {},
): ReturnType<typeof browserbaseFetchToolFactory> =>
  browserbaseFetchToolFactory(config);
