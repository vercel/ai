import { gateway, stepCountIs, streamText } from 'ai';
import { tools } from './tools';
import { devToolsHandler } from '../../src';
import { print } from './utils';
import 'dotenv/config';

const result = streamText({
  model: gateway('anthropic/claude-haiku-4.5'),
  system: 'Always call the weather before recommending plans.',
  prompt: 'Whats the weather in NYC and BOSTON in C?',
  tools,
  includeRawChunks: true,
  stopWhen: stepCountIs(5),
  experimental_telemetry: {
    isEnabled: true,
    handlers: [devToolsHandler()],
  },
  providerOptions: {
    anthropic: {
      thinking: {
        type: 'enabled',
        budgetTokens: 10000,
      },
    },
  },
});

print(await result.content);
