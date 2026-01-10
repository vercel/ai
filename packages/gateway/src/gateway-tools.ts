import { perplexitySearch } from './tool/perplexity-search';

/**
 * Gateway-specific provider-defined tools.
 */
export const gatewayTools = {
  /**
   * Search the web using Perplexity's Search API for real-time information,
   * news, research papers, and articles.
   *
   * Provides ranked search results with advanced filtering options including
   * domain, language, date range, and recency filters.
   */
  perplexitySearch,
};
