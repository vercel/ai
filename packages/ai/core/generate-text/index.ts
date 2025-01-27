export { generateText } from './generate-text';
export type { GenerateTextResult } from './generate-text-result';
export * as Output from './output';
export { smoothStream } from './smooth-stream';
export type { StepResult } from './step-result';
export { streamText } from './stream-text';
export type { StreamTextTransform } from './stream-text';
export type { StreamTextResult, TextStreamPart } from './stream-text-result';
export type { ToolCallRepairFunction } from './tool-call-repair';

// TODO 4.1: rename to ToolCall and ToolResult, deprecate old names
export type {
  CoreToolCall,
  CoreToolCallUnion,
  ToolCall,
  ToolCallUnion,
} from './tool-call';
export type {
  CoreToolResult,
  CoreToolResultUnion,
  ToolResult,
  ToolResultUnion,
} from './tool-result';
