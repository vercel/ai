import { gateway, stepCountIs, streamText, wrapLanguageModel } from 'ai';
import { tools } from './tools';
import { devToolsMiddleware } from '../../src';
import { print } from './utils';
import 'dotenv/config';

const result = streamText({
  model: wrapLanguageModel({
    middleware: devToolsMiddleware(),
    model: gateway('anthropic/claude-haiku-4.5'),
  }),
  system: 'Always call the weather before recommending plans.',
  prompt: 'Whats the weather in SF and London in C?',
  tools,
  stopWhen: stepCountIs(5),
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
