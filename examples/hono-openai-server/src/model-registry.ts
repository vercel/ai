import { openai } from '@ai-sdk/openai';
import { customProvider } from 'ai';

export const modelRegistry = customProvider({
  languageModels: {
    'openai/gpt-4o': openai('gpt-4o'),
    'openai/gpt-4o-mini': openai('gpt-4o-mini'),
  },
});
