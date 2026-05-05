export type MoonshotAIChatModelId =
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | 'kimi-k2'
  | 'kimi-k2-0905'
  | 'kimi-k2-thinking'
  | 'kimi-k2-thinking-turbo'
  | 'kimi-k2-turbo'
  | 'kimi-k2.5'
  | (string & {});

export { moonshotaiLanguageModelChatOptions as moonshotaiLanguageModelOptions } from './moonshotai-chat-language-model-options';
export type { MoonshotAILanguageModelChatOptions as MoonshotAILanguageModelOptions } from './moonshotai-chat-language-model-options';
