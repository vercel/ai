export type { ModelCallOptions } from './model-call-options';
export type { RequestOptions, TimeoutConfiguration } from './request-options';

import type { ModelCallOptions } from './model-call-options';
import type { RequestOptions } from './request-options';
/** @deprecated Use `ModelCallOptions` combined with `RequestOptions` instead. */
export type CallSettings = ModelCallOptions & Omit<RequestOptions, 'timeout'>;
export {
  getTotalTimeoutMs,
  getStepTimeoutMs,
  getChunkTimeoutMs,
  getToolTimeoutMs,
} from './request-options';
export {
  assistantModelMessageSchema,
  modelMessageSchema,
  systemModelMessageSchema,
  toolModelMessageSchema,
  userModelMessageSchema,
} from './message';
export type { Prompt } from './prompt';
export { convertDataContentToBase64String } from './data-content';

// re-export types from provider-utils
export type {
  AssistantContent,
  AssistantModelMessage,
  DataContent,
  FilePart,
  ImagePart,
  ModelMessage,
  SystemModelMessage,
  TextPart,
  ToolCallPart,
  ToolContent,
  ToolModelMessage,
  ToolResultPart,
  UserContent,
  UserModelMessage,
} from '@ai-sdk/provider-utils';
