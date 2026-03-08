import { createProviderToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Browser search tool for Groq models.
 *
 * Provides interactive browser search capabilities that go beyond traditional web search
 * by navigating websites interactively and providing more detailed results.
 *
 * Currently supported on:
 * - openai/gpt-oss-20b
 * - openai/gpt-oss-120b
 *
 * @see https://console.groq.com/docs/browser-search
 */
export const browserSearch = createProviderToolFactory<
  {
    // Browser search doesn't take input parameters - it's controlled by the prompt
    // The tool is activated automatically when included in the tools array
  },
  {
    // No configuration options needed - the tool works automatically
    // when included in the tools array for supported models
  }
>({
  id: 'groq.browser_search',
  inputSchema: z.object({}),
});
