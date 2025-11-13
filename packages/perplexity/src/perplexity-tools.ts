import { search } from './tool/search';

export const perplexityTools = {
  /**
   * Search the web using Perplexity's Search API for real-time information,
   * news, research papers, and articles.
   *
   * @param config - Configuration options for search including API key,
   * result limits, domain filters, language filters, and date ranges.
   *
   * @example
   * ```ts
   * import { perplexity } from '@ai-sdk/perplexity';
   * import { openai } from '@ai-sdk/openai';
   * import { generateText, stepCountIs } from 'ai';
   *
   * const { text } = await generateText({
   *   model: openai('gpt-5-mini'),
   *   prompt: 'What are the latest AI developments?',
   *   tools: {
   *     search: perplexity.tools.search({ max_results: 10 }),
   *   },
   *   stopWhen: stepCountIs(3),
   * });
   * ```
   */
  search,
};
