// packages/core/streams/inkeep-stream.ts
import {
  AIStream,
  type AIStreamCallbacksAndOptions,
  AIStreamParser,
} from './ai-stream';
import { z } from 'zod';
import { createStreamDataTransformer } from './stream-data';

export type AIStreamCallbacksAndOptionsWithInkeep =
  AIStreamCallbacksAndOptions &
    Pick<InkeepChatResultCallbacks, 'onCompleteMessage'>;

// Schema for an Inkeep Message Chunk
const InkeepMessageChunkDataSchema = z
  .object({
    chat_session_id: z.string(),
    content_chunk: z.string(),
    finish_reason: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

export type InkeepMessageChunkData = z.infer<
  typeof InkeepMessageChunkDataSchema
>;

export type InkeepMessage = {
  role: 'user' | 'assistant';
  content: string;
  [key: string]: any;
};

export type InkeepCompleteMessage = {
  chat_session_id: string;
  message: InkeepMessage;
};

export type InkeepChatResultCallbacks = {
  onCompleteMessage?: (completeMessage: InkeepCompleteMessage) => void;
};

export function InkeepStream(
  res: Response,
  callbacks?: AIStreamCallbacksAndOptionsWithInkeep,
): ReadableStream {
  if (!res.body) {
    throw new Error('Response body is null');
  }

  let completeContent = '';
  let chat_session_id = '';

  const inkeepEventParser: AIStreamParser = (data: string) => {
    let inkeepContentChunk: InkeepMessageChunkData;
    try {
      inkeepContentChunk = InkeepMessageChunkDataSchema.parse(
        JSON.parse(data),
      ) as InkeepMessageChunkData;
    } catch (error) {
      return;
    }

    chat_session_id = inkeepContentChunk.chat_session_id;
    completeContent += inkeepContentChunk.content_chunk;

    return inkeepContentChunk.content_chunk;
  };

  let onCompleteMessage;
  let userCoreCallbacks: AIStreamCallbacksAndOptions | undefined;

  if (callbacks) {
    ({ onCompleteMessage, ...userCoreCallbacks } = callbacks);
  }

  const inkeepCallbacks: InkeepChatResultCallbacks = {
    onCompleteMessage,
  };

  let callbacksCore = { ...userCoreCallbacks };

  callbacksCore = {
    ...callbacksCore,
    onEvent: e => {
      if (userCoreCallbacks?.onEvent) {
        userCoreCallbacks.onEvent(e);
      }
      if (e.type === 'event') {
        if (e.event === 'message_chunk') {
          const chunk = InkeepMessageChunkDataSchema.parse(
            JSON.parse(e.data),
          ) as InkeepMessageChunkData;
          if (chunk.finish_reason === 'stop') {
            inkeepCallbacks.onCompleteMessage?.({
              chat_session_id: chunk.chat_session_id,
              message: {
                role: 'assistant',
                content: completeContent,
              },
            });
          }
        }
      }
    },
  };

  return AIStream(res, inkeepEventParser, callbacksCore).pipeThrough(
    createStreamDataTransformer(callbacksCore?.experimental_streamData),
  );
}
