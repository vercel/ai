import OpenAI from 'openai';
import {
  OpenAIChatLanguageModel,
  OpenAIChatMessageGeneratorSettings,
} from '../openai/openai-chat-language-model';

export function chat(settings: OpenAIChatMessageGeneratorSettings) {
  return new OpenAIChatLanguageModel({
    client: new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY || '',
      baseURL: 'https://api.perplexity.ai/',
    }),
    ...settings,
  });
}
