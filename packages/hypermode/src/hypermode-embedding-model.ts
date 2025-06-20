import { OpenAICompatibleEmbeddingModel } from '@ai-sdk/openai-compatible';

// Right now, we only support OpenAI's /v1/embeddings API
export class HypermodeEmbeddingModel extends OpenAICompatibleEmbeddingModel {}
