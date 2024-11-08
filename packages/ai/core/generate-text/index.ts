export { generateText } from './generate-text';
export type { GenerateTextResult } from './generate-text-result';
export type { StepResult } from './step-result';
export { streamText } from './stream-text';
export type { StreamTextResult, TextStreamPart } from './stream-text-result';

// TODO 4.1: rename to ToolCall and ToolResult, deprecate old names
export type {
  ToolCall as CoreToolCall,
  ToolCallUnion as CoreToolCallUnion,
} from './tool-call';
export type {
  ToolResult as CoreToolResult,
  ToolResultUnion as CoreToolResultUnion,
} from './tool-result';
