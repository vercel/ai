import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import type { LanguageModel, ToolChoice, ToolSet } from 'ai';
import type {
  GenerationSettings,
  PrepareStepResult,
} from './workflow-agent.js';

export interface AppliedPrepareStepResult {
  model?: LanguageModel;
  messages?: LanguageModelV4Prompt;
  context?: unknown;
  activeTools?: string[];
  generationSettings: Partial<GenerationSettings>;
  toolChoice?: ToolChoice<ToolSet>;
}

export function applyPrepareStepResult(
  prepareResult: PrepareStepResult,
  currentMessages: LanguageModelV4Prompt,
): AppliedPrepareStepResult {
  const result: AppliedPrepareStepResult = {
    generationSettings: {},
  };

  if (prepareResult.model !== undefined) {
    result.model = prepareResult.model;
  }

  if (prepareResult.messages !== undefined) {
    result.messages = [...prepareResult.messages];
  }

  if (prepareResult.system !== undefined) {
    const messages = result.messages ?? [...currentMessages];
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = { role: 'system', content: prepareResult.system };
    } else {
      messages.unshift({ role: 'system', content: prepareResult.system });
    }
    result.messages = messages;
  }

  if (prepareResult.experimental_context !== undefined) {
    result.context = prepareResult.experimental_context;
  }

  if (prepareResult.activeTools !== undefined) {
    result.activeTools = prepareResult.activeTools;
  }

  if (prepareResult.toolChoice !== undefined) {
    result.toolChoice = prepareResult.toolChoice;
  }

  if (prepareResult.maxOutputTokens !== undefined) {
    result.generationSettings.maxOutputTokens = prepareResult.maxOutputTokens;
  }
  if (prepareResult.temperature !== undefined) {
    result.generationSettings.temperature = prepareResult.temperature;
  }
  if (prepareResult.topP !== undefined) {
    result.generationSettings.topP = prepareResult.topP;
  }
  if (prepareResult.topK !== undefined) {
    result.generationSettings.topK = prepareResult.topK;
  }
  if (prepareResult.presencePenalty !== undefined) {
    result.generationSettings.presencePenalty = prepareResult.presencePenalty;
  }
  if (prepareResult.frequencyPenalty !== undefined) {
    result.generationSettings.frequencyPenalty = prepareResult.frequencyPenalty;
  }
  if (prepareResult.stopSequences !== undefined) {
    result.generationSettings.stopSequences = prepareResult.stopSequences;
  }
  if (prepareResult.seed !== undefined) {
    result.generationSettings.seed = prepareResult.seed;
  }
  if (prepareResult.maxRetries !== undefined) {
    result.generationSettings.maxRetries = prepareResult.maxRetries;
  }
  if (prepareResult.headers !== undefined) {
    result.generationSettings.headers = prepareResult.headers;
  }
  if (prepareResult.providerOptions !== undefined) {
    result.generationSettings.providerOptions = prepareResult.providerOptions;
  }

  return result;
}

export function filterToolsByActiveTools(
  tools: ToolSet,
  activeTools: string[],
): ToolSet {
  if (activeTools.length === 0) return tools;
  const activeToolsSet = new Set(activeTools);
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => activeToolsSet.has(name)),
  );
}

export function getErrorMessage(error: unknown): string {
  if (error == null) return 'unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return JSON.stringify(error);
}
