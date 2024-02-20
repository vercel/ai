import OpenAI from 'openai';
import {
  OpenAIChatMessageGenerator,
  OpenAIChatMessageGeneratorSettings,
} from '../openai/openai-chat-message-generator';

export function chat(settings: OpenAIChatMessageGeneratorSettings) {
  return new OpenAIChatMessageGenerator({
    client: new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY || '',
      baseURL: 'https://api.perplexity.ai/',
    }),
    ...settings,
  });
}
