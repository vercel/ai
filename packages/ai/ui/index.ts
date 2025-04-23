export { generateId } from '@ai-sdk/provider-utils';
export { callChatApi } from './call-chat-api';
export { callCompletionApi } from './call-completion-api';
export { formatDataStreamPart, parseDataStreamPart } from './data-stream-parts';
export type { DataStreamPart, DataStreamString } from './data-stream-parts';
export { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
export { fillMessageParts } from './fill-message-parts';
export { getMessageParts } from './get-message-parts';
export { prepareAttachmentsForRequest } from './prepare-attachments-for-request';
export { processDataStream } from './process-data-stream';
export { processTextStream } from './process-text-stream';
export {
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from './should-resubmit-messages';
export { updateToolCallResult } from './update-tool-call-result';
