import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  combineHeaders,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { loadScrapeGraphApiKey } from './scrapegraph-config';
import { scrapeGraphFailedResponseHandler } from './scrapegraph-error';
import type {
  SmartScraperConfig,
  SearchScraperConfig,
  MarkdownifyConfig,
  ScrapeConfig,
  CrawlConfig,
  AgenticScraperConfig,
  SitemapConfig,
  CrawlInitiateResponse,
  CrawlFetchResultsResponse,
  ScrapeGraphAPIResponse,
} from './scrapegraph-types';
import { VERSION } from './version';

export interface ScrapeGraphProviderSettings {
  /**
   * ScrapeGraph AI API key. Default value is taken from the `SCRAPEGRAPH_API_KEY` or `SGAI_APIKEY` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   * The default prefix is `https://api.scrapegraphai.com/v1`.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface ScrapeGraphProvider {
  /**
   * Extract structured data from a website using AI-powered extraction.
   *
   * @param config - Configuration for the SmartScraper API
   * @returns Promise with the extracted data
   */
  smartScraper<T = any>(config: SmartScraperConfig): Promise<T>;

  /**
   * Search the web and extract structured data from search results.
   *
   * @param config - Configuration for the SearchScraper API
   * @returns Promise with the search and extraction results
   */
  searchScraper<T = any>(config: SearchScraperConfig): Promise<T>;

  /**
   * Convert a webpage to clean, formatted markdown.
   *
   * @param config - Configuration for the Markdownify API
   * @returns Promise with the markdown content
   */
  markdownify(config: MarkdownifyConfig): Promise<string>;

  /**
   * Fetch raw page content from any URL with optional JavaScript rendering.
   *
   * @param config - Configuration for the Scrape API
   * @returns Promise with the raw HTML content
   */
  scrape(config: ScrapeConfig): Promise<string>;

  /**
   * Initiate an asynchronous multi-page web crawling operation.
   *
   * @param config - Configuration for the Crawl API
   * @returns Promise with the crawl request ID for polling
   */
  crawlInitiate(config: CrawlConfig): Promise<CrawlInitiateResponse>;

  /**
   * Fetch results from a crawl operation.
   *
   * @param requestId - The request ID from crawlInitiate
   * @returns Promise with the crawl results
   */
  crawlFetchResults(requestId: string): Promise<CrawlFetchResultsResponse>;

  /**
   * Execute complex multi-step web scraping workflows with AI-powered automation.
   *
   * @param config - Configuration for the Agentic Scraper API
   * @returns Promise with the extracted data
   */
  agenticScraper<T = any>(config: AgenticScraperConfig): Promise<T>;

  /**
   * Extract and discover the complete sitemap structure of any website.
   *
   * @param config - Configuration for the Sitemap API
   * @returns Promise with the sitemap data
   */
  sitemap<T = any>(config: SitemapConfig): Promise<T>;
}

const defaultBaseURL = 'https://api.scrapegraphai.com/v1';

/**
 * Create a ScrapeGraph AI provider instance.
 */
export function createScrapeGraph(
  options: ScrapeGraphProviderSettings = {},
): ScrapeGraphProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      combineHeaders(
        {
          'Content-Type': 'application/json',
          'SGAI-APIKEY': loadScrapeGraphApiKey({
            apiKey: options.apiKey,
          }),
        },
        options.headers,
      ),
      `ai-sdk/scrapegraph/${VERSION}`,
    );

  const fetchFunction = options.fetch ?? fetch;

  async function callApi<T = any>(
    endpoint: string,
    body: any,
  ): Promise<T> {
    const response = await fetchFunction(`${baseURL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await scrapeGraphFailedResponseHandler({
        response,
        url: `${baseURL}${endpoint}`,
        requestBodyValues: body,
      });
      throw error;
    }

    const json = await response.json();

    // Handle different response formats
    if (json.data !== undefined) {
      return json.data;
    }

    return json;
  }

  return {
    async smartScraper<T = any>(config: SmartScraperConfig): Promise<T> {
      return callApi<T>('/smartscraper', config);
    },

    async searchScraper<T = any>(config: SearchScraperConfig): Promise<T> {
      return callApi<T>('/searchscraper', config);
    },

    async markdownify(config: MarkdownifyConfig): Promise<string> {
      const result = await callApi<any>('/markdownify', config);
      return typeof result === 'string' ? result : result.markdown ?? result;
    },

    async scrape(config: ScrapeConfig): Promise<string> {
      const result = await callApi<any>('/scrape', config);
      return typeof result === 'string' ? result : result.html ?? result;
    },

    async crawlInitiate(config: CrawlConfig): Promise<CrawlInitiateResponse> {
      return callApi<CrawlInitiateResponse>('/crawl', config);
    },

    async crawlFetchResults(
      requestId: string,
    ): Promise<CrawlFetchResultsResponse> {
      return callApi<CrawlFetchResultsResponse>('/crawl/results', {
        request_id: requestId,
      });
    },

    async agenticScraper<T = any>(config: AgenticScraperConfig): Promise<T> {
      return callApi<T>('/agentic-scrapper', config);
    },

    async sitemap<T = any>(config: SitemapConfig): Promise<T> {
      return callApi<T>('/sitemap', config);
    },
  };
}

/**
 * Default ScrapeGraph AI provider instance.
 */
export const scrapegraph = createScrapeGraph();

