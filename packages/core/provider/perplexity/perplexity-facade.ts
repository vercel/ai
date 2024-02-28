import {
  OpenAIChatLanguageModel,
  OpenAIChatLanguageModelSettings,
} from '../openai/openai-chat-language-model';

export function chat(settings: OpenAIChatLanguageModelSettings) {
  return new OpenAIChatLanguageModel({
    client: {
      apiKey: process.env.PERPLEXITY_API_KEY!, // TODO error if not set & lazy load
      baseURL: 'https://api.perplexity.ai/',
    },
    ...settings,
  });
}
