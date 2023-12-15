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

export type OnFinalInkeepMetadata = {
  chat_session_id: string;
};

export type InkeepAIStreamCallbacksAndOptions = AIStreamCallbacksAndOptions & {
  onFinal?: (
    completion: string,
    metadata?: OnFinalInkeepMetadata,
  ) => Promise<void> | void;
};

export function InkeepStream(
  res: Response,
  callbacks?: InkeepAIStreamCallbacksAndOptions,
): ReadableStream {
  if (!res.body) {
    throw new Error('Response body is null');
  }

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

    return inkeepContentChunk.content_chunk;
  };

  // extend onFinal callback with Inkeep specific metadata
  const passThroughCallbacks = {
    ...callbacks,
    onFinal: (completion: string) => {
      const onFinalInkeepMetadata: OnFinalInkeepMetadata = {
        chat_session_id,
      };
      callbacks?.onFinal?.(completion, onFinalInkeepMetadata);
    },
  };

  return AIStream(res, inkeepEventParser, passThroughCallbacks).pipeThrough(
    createStreamDataTransformer(passThroughCallbacks?.experimental_streamData),
  );
}
