export type { TencentChatModelId } from './tencent-chat-options';

/**
 * TokenHub accepts the OpenAI-compatible chat options. Keys under
 * `providerOptions.tencent` that are not part of that set (for example
 * `thinking`) are forwarded to the request body unchanged.
 */
export type TencentLanguageModelChatOptions = Record<string, never>;
