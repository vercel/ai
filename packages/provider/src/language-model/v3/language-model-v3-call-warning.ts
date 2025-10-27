import { LanguageModelV3CallOptions } from './language-model-v3-call-options';
import { LanguageModelV3FunctionTool } from './language-model-v3-function-tool';
import { LanguageModelV3ProviderDefinedTool } from './language-model-v3-provider-defined-tool';

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
 */
export type LanguageModelV3CallWarning =
  | {
      type: 'unsupported-setting';
      setting: Omit<keyof LanguageModelV3CallOptions, 'prompt'>;
      details?: string;
    }
  | {
      type: 'unsupported-tool';
      tool: LanguageModelV3FunctionTool | LanguageModelV3ProviderDefinedTool;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };
