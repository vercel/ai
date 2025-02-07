import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { customProvider } from 'ai';

export const modelRegistry = customProvider({
  languageModels: {
    // openai models
    'openai/gpt-4o': openai('gpt-4o'),
    'openai/gpt-4o-mini': openai('gpt-4o-mini'),

    // anthropic models
    'anthropic/claude-3-5-haiku-20241022': anthropic(
      'claude-3-5-haiku-20241022',
    ),
  },
});
