/**
 * Configuration for SmartScraper API
 */
export interface SmartScraperConfig {
  website_url: string;
  user_prompt: string;
  output_schema?: Record<string, any>;
  number_of_scrolls?: number;
  total_pages?: number;
  render_heavy_js?: boolean;
  stealth?: boolean;
}

/**
 * Configuration for SearchScraper API
 */
export interface SearchScraperConfig {
  user_prompt: string;
  num_results?: number;
  number_of_scrolls?: number;
}

/**
 * Configuration for Markdownify API
 */
export interface MarkdownifyConfig {
  website_url: string;
  render_heavy_js?: boolean;
}

/**
 * Configuration for Scrape API
 */
export interface ScrapeConfig {
  website_url: string;
  render_heavy_js?: boolean;
}

/**
 * Configuration for Crawl API
 */
export interface CrawlConfig {
  url: string;
  prompt?: string;
  depth?: number;
  max_pages?: number;
  same_domain_only?: boolean;
  cache_website?: boolean;
  extraction_mode?: boolean | 'ai' | 'markdown';
  sitemap?: boolean;
}

/**
 * Configuration for Agentic Scraper API
 */
export interface AgenticScraperConfig {
  url: string;
  user_prompt?: string;
  output_schema?: Record<string, any>;
  steps?: string[];
  ai_extraction?: boolean;
  persistent_session?: boolean;
  timeout_seconds?: number;
}

/**
 * Configuration for Sitemap API
 */
export interface SitemapConfig {
  website_url: string;
}

/**
 * Response from Crawl API initiation
 */
export interface CrawlInitiateResponse {
  request_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
}

/**
 * Response from Crawl API fetch results
 */
export interface CrawlFetchResultsResponse {
  request_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  data?: any;
  error?: string;
  pages_crawled?: number;
  pages_remaining?: number;
}

/**
 * Generic API response
 */
export interface ScrapeGraphAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

