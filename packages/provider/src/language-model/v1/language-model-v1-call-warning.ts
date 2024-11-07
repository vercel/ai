import { LanguageModelV1CallSettings } from './language-model-v1-call-settings';
import { LanguageModelV1FunctionTool } from './language-model-v1-function-tool';
import { LanguageModelV1ProviderDefinedTool } from './language-model-v1-provider-defined-tool';

/**
Warning from the model provider for this call. The call will proceed, but e.g.
some settings might not be supported, which can lead to suboptimal results.
 */
export type LanguageModelV1CallWarning =
  | {
      type: 'unsupported-setting';
      setting: keyof LanguageModelV1CallSettings;
      details?: string;
    }
  | {
      type: 'unsupported-tool';
      tool: LanguageModelV1FunctionTool | LanguageModelV1ProviderDefinedTool;
      details?: string;
    }
  | {
      type: 'other';
      message: string;
    };
