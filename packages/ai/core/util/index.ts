export { generateId } from '@ai-sdk/provider-utils';

// Export stream data utilities for custom stream implementations,
// both on the client and server side.
// NOTE: this is experimental / internal and may change without notice
export { callChatApi } from './call-chat-api';
export { callChatApiV2 } from './call-chat-api-v2';
export { callCompletionApi } from './call-completion-api';
export { ChatStore } from './chat-store';
export { formatDataStreamPart, parseDataStreamPart } from './data-stream-parts';
export type { DataStreamPart, DataStreamString } from './data-stream-parts';
export { getTextFromDataUrl } from './data-url';
export type { DeepPartial } from './deep-partial';
export { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
export { fillMessageParts } from './fill-message-parts';
export { getMessageParts } from './get-message-parts';
export { isDeepEqualData } from './is-deep-equal-data';
export { parsePartialJson } from './parse-partial-json';
export { prepareAttachmentsForRequest } from './prepare-attachments-for-request';
export { processDataStream } from './process-data-stream';
export { processTextStream } from './process-text-stream';
export { asSchema, jsonSchema } from './schema';
export type { Schema } from './schema';
export {
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from './should-resubmit-messages';
export { updateToolCallResult } from './update-tool-call-result';
export { zodSchema } from './zod-schema';
