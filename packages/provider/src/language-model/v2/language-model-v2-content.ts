import { LanguageModelV2File } from './language-model-v2-file';
import { LanguageModelV2Reasoning } from './language-model-v2-reasoning';
import { LanguageModelV2Source } from './language-model-v2-source';
import { LanguageModelV2Text } from './language-model-v2-text';
import { LanguageModelV2ToolCall } from './language-model-v2-tool-call';

export type LanguageModelV2Content =
  | LanguageModelV2Text
  | LanguageModelV2Reasoning
  | LanguageModelV2File
  | LanguageModelV2Source
  | LanguageModelV2ToolCall;
