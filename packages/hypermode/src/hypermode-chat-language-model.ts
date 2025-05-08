import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

// Right now, we only support OpenAI's /v1/chat/completions API
export class HypermodeChatLanguageModel extends OpenAICompatibleChatLanguageModel {}
