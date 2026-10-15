// @ts-nocheck
import { LanguageModelUsage as TokenUsage, LanguageModelUsage as CompletionTokenUsage, EmbeddingModelUsage as EmbeddingTokenUsage } from 'ai';

function recordUsage(usage: TokenUsage) {
  console.log(usage);
}

function processEmbedding(usage: EmbeddingTokenUsage) {
  console.log(usage);
}

const handler = (data: CompletionTokenUsage) => {
  console.log(data);
};
