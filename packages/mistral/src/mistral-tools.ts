import { webSearch } from './tool/web-search';
import { webSearchPremium } from './tool/web-search-premium';

export const mistralTools = {
  /**
   * Web search allows Mistral models to access current information from the
   * internet and return source citations.
   *
   * This tool requires a model created with `mistral.conversations()`.
   */
  webSearch,

  /**
   * Premium web search allows Mistral models to access a search engine and
   * news articles with integrated news provider verification.
   *
   * This tool requires a model created with `mistral.conversations()`.
   */
  webSearchPremium,
};
