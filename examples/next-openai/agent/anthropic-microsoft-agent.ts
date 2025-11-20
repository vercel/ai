import 'dotenv/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

function createAgent() {
  const resourceName = process.env.ANTHROPIC_MICROSOFT_RESOURCE_NAME;
  const apiKey = process.env.ANTHROPIC_MICROSOFT_API_KEY;
  if (!resourceName || !apiKey) {
    throw new Error('undefined resource or key.');
  }

  const anthropic = createAnthropic({
    baseURL: `https://${resourceName}.services.ai.azure.com/anthropic/v1/`,
    apiKey,
  });

  const anthropicMicrosoftAgent = new ToolLoopAgent({
    model: anthropic('claude-sonnet-4-5'),
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 3,
        userLocation: {
          type: 'approximate',
          city: 'New York',
          country: 'US',
          timezone: 'America/New_York',
        },
      }),
      web_fetch: anthropic.tools.webFetch_20250910(),
    },
  });

  return anthropicMicrosoftAgent;
}

export const anthropicMicrosoftAgent = createAgent();

export type AnthropicMicrosoftMessage = InferAgentUIMessage<
  typeof anthropicMicrosoftAgent
>;
