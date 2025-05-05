export {
  asSchema,
  generateId,
  jsonSchema,
  type Schema,
} from '@ai-sdk/provider-utils';

// Export stream data utilities for custom stream implementations,
// both on the client and server side.
// NOTE: this is experimental / internal and may change without notice
export { callChatApi } from './call-chat-api';
export { callCompletionApi } from './call-completion-api';
export { convertFileListToFileUIParts } from './convert-file-list-to-file-ui-parts';
export { formatDataStreamPart, parseDataStreamPart } from './data-stream-parts';
export type { DataStreamPart, DataStreamText } from './data-stream-parts';
export { getTextFromDataUrl } from './data-url';
export type { DeepPartial } from './deep-partial';
export { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
export { isDeepEqualData } from './is-deep-equal-data';
export { parsePartialJson } from './parse-partial-json';
export { processDataStream } from './process-data-stream';
export { processTextStream } from './process-text-stream';
export {
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from './should-resubmit-messages';
export { updateToolCallResult } from './update-tool-call-result';
