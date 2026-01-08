import { perplexitySearch } from './tool/perplexity-search';

/**
 * Gateway-specific provider-defined tools.
 *
 * These tools are executed server-side by the AI Gateway, which handles:
 * - Authentication with external APIs
 * - Rate limiting and retry logic
 * - Usage tracking and billing
 * - Observability and logging
 */
export const gatewayTools = {
    /**
     * Search the web using Perplexity's Search API for real-time information,
     * news, research papers, and articles.
     *
     * Provides ranked search results with advanced filtering options including
     * domain, language, date range, and recency filters.
     *
     * Must have name `perplexity_search`.
     *
     * @example
     * ```ts
     * import { generateText } from 'ai';
     * import { gateway } from '@ai-sdk/gateway';
     *
     * const result = await generateText({
     *   model: gateway('openai/gpt-4o'),
     *   prompt: 'What are the latest developments in quantum computing?',
     *   tools: {
     *     search: gateway.tools.perplexitySearch(),
     *   },
     * });
     * ```
     */
    perplexitySearch,
};
