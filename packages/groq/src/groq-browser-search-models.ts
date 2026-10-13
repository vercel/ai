import type { GroqChatModelId } from './groq-chat-options';

// Known models without native browser search. Unknown IDs inherit current
// tool support so newly released models do not lose requested tools.
const modelsWithoutBrowserSearch = new Set<GroqChatModelId>([
  'gemma2-9b-it',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-guard-4-12b',
  'deepseek-r1-distill-llama-70b',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-prompt-guard-2-22m',
  'meta-llama/llama-prompt-guard-2-86m',
  'moonshotai/kimi-k2-instruct-0905',
  'qwen/qwen3-32b',
  'llama-guard-3-8b',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'qwen-qwq-32b',
  'qwen-2.5-32b',
  'deepseek-r1-distill-qwen-32b',
]);

export function isBrowserSearchSupportedModel(
  modelId: GroqChatModelId,
): boolean {
  return !modelsWithoutBrowserSearch.has(modelId);
}
