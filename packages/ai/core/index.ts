// re-exports:
export { createIdGenerator, generateId } from '@ai-sdk/provider-utils';
export type { IDGenerator } from '@ai-sdk/provider-utils';
export {
  formatAssistantStreamPart,
  formatDataStreamPart,
  jsonSchema,
  parseAssistantStreamPart,
  parseDataStreamPart,
  processDataStream,
  processTextStream,
  zodSchema,
} from '@ai-sdk/ui-utils';
export type {
  AssistantMessage,
  AssistantStatus,
  Attachment,
  ChatRequest,
  ChatRequestOptions,
  CreateMessage,
  DataMessage,
  DataStreamPart,
  DeepPartial,
  IdGenerator,
  JSONValue,
  Message,
  UIMessage,
  RequestOptions,
  Schema,
  ToolInvocation,
  UseAssistantOptions,
} from '@ai-sdk/ui-utils';

// directory exports:
export * from './data-stream';
export * from './embed';
export * from './generate-image';
export * from './generate-object';
export * from './generate-text';
export * from './middleware';
export * from './prompt';
export * from './registry';
export * from './tool';
export * from './types';

// telemetry types:
export type { TelemetrySettings } from './telemetry/telemetry-settings';

// util exports:
export { cosineSimilarity } from './util/cosine-similarity';
export { simulateReadableStream } from './util/simulate-readable-stream';

import { generateText } from 'ai';
import { sambanova } from '@ai-sdk/sambanova';

const result = await generateText({
  model: sambanova('Llama-3.1-8B-Instruct'),
  prompt: 'What is the capital of the moon?',
});
