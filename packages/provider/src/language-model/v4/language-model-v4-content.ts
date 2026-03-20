import { LanguageModelV4CustomContent } from './language-model-v4-custom-content';
import { LanguageModelV4File } from './language-model-v4-file';
import { LanguageModelV4Reasoning } from './language-model-v4-reasoning';
import { LanguageModelV4ReasoningFile } from './language-model-v4-reasoning-file';
import { LanguageModelV4Source } from './language-model-v4-source';
import { LanguageModelV4Text } from './language-model-v4-text';
import { LanguageModelV4ToolApprovalRequest } from './language-model-v4-tool-approval-request';
import { LanguageModelV4ToolCall } from './language-model-v4-tool-call';
import { LanguageModelV4ToolResult } from './language-model-v4-tool-result';

export type LanguageModelV4Content =
  | LanguageModelV4Text
  | LanguageModelV4Reasoning
  | LanguageModelV4CustomContent
  | LanguageModelV4ReasoningFile
  | LanguageModelV4File
  | LanguageModelV4ToolApprovalRequest
  | LanguageModelV4Source
  | LanguageModelV4ToolCall
  | LanguageModelV4ToolResult;
