import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

export const anthropicWebSearchAgent = new ToolLoopAgent({
  model: anthropic('claude-sonnet-4-5'),
  tools: {
    web_search: anthropic.tools.webSearch_20250305({
      maxUses: 3,
      userLocation: {
        type: 'approximate',
        city: 'New York',
        country: 'US',
        timezone: 'America/New_York',
      },
    }),
  },
  providerOptions: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 12000 },
    } satisfies AnthropicProviderOptions,
  },
});

export type AnthropicWebSearchMessage = InferAgentUIMessage<
  typeof anthropicWebSearchAgent
>;
