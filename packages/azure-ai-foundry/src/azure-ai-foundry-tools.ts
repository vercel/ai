import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearchPreview,
} from '@ai-sdk/openai/internal';
import { anthropicTools } from '@ai-sdk/anthropic/internal';

/**
 * Merged provider tools for Azure AI Foundry, combining OpenAI and Anthropic
 * tool definitions.
 */
export const azureAIFoundryTools: {
  // OpenAI tools — explicit typeof annotations to avoid TS2742
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  webSearchPreview: typeof webSearchPreview;
  // Anthropic tools
  bash_20241022: typeof anthropicTools.bash_20241022;
  bash_20250124: typeof anthropicTools.bash_20250124;
  codeExecution_20250522: typeof anthropicTools.codeExecution_20250522;
  codeExecution_20250825: typeof anthropicTools.codeExecution_20250825;
  computer_20241022: typeof anthropicTools.computer_20241022;
  computer_20250124: typeof anthropicTools.computer_20250124;
  computer_20251124: typeof anthropicTools.computer_20251124;
  memory_20250818: typeof anthropicTools.memory_20250818;
  textEditor_20241022: typeof anthropicTools.textEditor_20241022;
  textEditor_20250124: typeof anthropicTools.textEditor_20250124;
  textEditor_20250429: typeof anthropicTools.textEditor_20250429;
  textEditor_20250728: typeof anthropicTools.textEditor_20250728;
  webFetch_20250910: typeof anthropicTools.webFetch_20250910;
  webSearch_20250305: typeof anthropicTools.webSearch_20250305;
  toolSearchRegex_20251119: typeof anthropicTools.toolSearchRegex_20251119;
  toolSearchBm25_20251119: typeof anthropicTools.toolSearchBm25_20251119;
} = {
  // OpenAI tools
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearchPreview,

  // Anthropic tools
  bash_20241022: anthropicTools.bash_20241022,
  bash_20250124: anthropicTools.bash_20250124,
  codeExecution_20250522: anthropicTools.codeExecution_20250522,
  codeExecution_20250825: anthropicTools.codeExecution_20250825,
  computer_20241022: anthropicTools.computer_20241022,
  computer_20250124: anthropicTools.computer_20250124,
  computer_20251124: anthropicTools.computer_20251124,
  memory_20250818: anthropicTools.memory_20250818,
  textEditor_20241022: anthropicTools.textEditor_20241022,
  textEditor_20250124: anthropicTools.textEditor_20250124,
  textEditor_20250429: anthropicTools.textEditor_20250429,
  textEditor_20250728: anthropicTools.textEditor_20250728,
  webFetch_20250910: anthropicTools.webFetch_20250910,
  webSearch_20250305: anthropicTools.webSearch_20250305,
  toolSearchRegex_20251119: anthropicTools.toolSearchRegex_20251119,
  toolSearchBm25_20251119: anthropicTools.toolSearchBm25_20251119,
};
