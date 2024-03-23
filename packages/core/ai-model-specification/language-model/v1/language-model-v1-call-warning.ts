import { LanguageModelV1CallSettings } from './language-model-v1-call-settings';

/**
 * Warning from the model provider for this call. The call will proceed, but e.g.
 * some settings might not be supported, which can lead to suboptimal results.
 */
export type LanguageModelV1CallWarning =
  | { type: 'unsupported-setting'; setting: keyof LanguageModelV1CallSettings }
  | { type: 'other'; message: string };
