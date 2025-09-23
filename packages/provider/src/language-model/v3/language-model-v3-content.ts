import { LanguageModelV2File } from './language-model-v3-file';
import { LanguageModelV2Reasoning } from './language-model-v3-reasoning';
import { LanguageModelV2Source } from './language-model-v3-source';
import { LanguageModelV2Text } from './language-model-v3-text';
import { LanguageModelV2ToolCall } from './language-model-v3-tool-call';
import { LanguageModelV2ToolResult } from './language-model-v3-tool-result';

export type LanguageModelV2Content =
  | LanguageModelV2Text
  | LanguageModelV2Reasoning
  | LanguageModelV2File
  | LanguageModelV2Source
  | LanguageModelV2ToolCall
  | LanguageModelV2ToolResult;
