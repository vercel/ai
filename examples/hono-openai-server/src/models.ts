import { openai } from '@ai-sdk/openai';
import { customProvider } from 'ai';

export const models = customProvider({
  languageModels: {
    'gpt-4o': openai('gpt-4o'),
    'gpt-4o-mini': openai('gpt-4o-mini'),
  },
});
