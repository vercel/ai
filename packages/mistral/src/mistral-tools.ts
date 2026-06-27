import { webSearch } from './tool/web-search';
import { webSearchPremium } from './tool/web-search-premium';

export const mistralTools = {
  /**
   * Mistral's built-in web search tool.
   *
   * When included in the `tools` array, the model can perform live web searches
   * to answer questions that require up-to-date information.
   *
   * @see https://docs.mistral.ai/agents/tools/built-in/websearch
   */
  webSearch,

  /**
   * Mistral's built-in premium web search tool.
   *
   * Higher-quality variant of the built-in web search, backed by a premium
   * search index.
   *
   * @see https://docs.mistral.ai/agents/tools/built-in/websearch
   */
  webSearchPremium,
};
