// packages/core/streams/inkeep-stream.ts
import {
  AIStream,
  type AIStreamCallbacksAndOptions,
  AIStreamParser,
} from './ai-stream';
import { z } from 'zod';
import { createStreamDataTransformer } from './stream-data';

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

export type OnFinalPayloadInkeep = {
  chat_session_id: string;
  message: InkeepMessage;
};

export type InkeepChatResultCallbacks = {
  onFinalPayload?: (payload: OnFinalPayloadInkeep) => void;
};

export type AIStreamCallbacksAndOptionsWithInkeep =
  AIStreamCallbacksAndOptions &
    Pick<InkeepChatResultCallbacks, 'onFinalPayload'>;

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

  // split callbacks between core ones supported for all AI providers and Inkeep specific ones

  let onFinalPayload;
  let coreCallbacks: AIStreamCallbacksAndOptions | undefined;

  if (callbacks) {
    ({ onFinalPayload, ...coreCallbacks } = callbacks);
  }

  const inkeepCallbacks: InkeepChatResultCallbacks = {
    onFinalPayload,
  };

  let finalCallbacks = { ...coreCallbacks };

  // add Inkeep specific callbacks using onEvent
  finalCallbacks = {
    ...finalCallbacks,
    onEvent: e => {
      if (coreCallbacks?.onEvent) {
        coreCallbacks.onEvent(e);
      }
      if (e.type === 'event') {
        if (e.event === 'message_chunk') {
          const chunk = InkeepMessageChunkDataSchema.parse(
            JSON.parse(e.data),
          ) as InkeepMessageChunkData;
          if (chunk.finish_reason === 'stop') {
            inkeepCallbacks.onFinalPayload?.({
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

  return AIStream(res, inkeepEventParser, finalCallbacks).pipeThrough(
    createStreamDataTransformer(finalCallbacks?.experimental_streamData),
  );
}
