import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';

/**
 * GMI Cloud chat completions over the OpenAI-compatible protocol. The only
 * customization is the error structure (see ./gmicloud-error.ts): GMI's edge
 * nests the backend engine's diagnostic in `error.details`, which the default
 * OpenAI-compatible error handling drops.
 */
export class GmicloudChatLanguageModel extends OpenAICompatibleChatLanguageModel {}
