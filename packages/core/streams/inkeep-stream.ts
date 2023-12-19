// packages/core/streams/inkeep-stream.ts
import {
  AIStream,
  type AIStreamCallbacksAndOptions,
  AIStreamParser,
} from './ai-stream';
import { z } from 'zod';
import { createStreamDataTransformer } from './stream-data';

export type InkeepMessage = {
  role: 'user' | 'assistant';
  content: string;
  [key: string]: any;
};

// Schema for an Inkeep Message Chunk
const InkeepMessageChunkDataSchema = z
  .object({
    chat_session_id: z.string(),
    content_chunk: z.string(),
    finish_reason: z.union([z.string(), z.null()]).optional().nullable(),
  })
  .passthrough();

export type InkeepMessageChunkData = z.infer<
  typeof InkeepMessageChunkDataSchema
>;

export type OnFinalInkeepMetadata = {
  chat_session_id: string;
};

const RecordSchema = z
  .object({
    type: z.string(),
    url: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    breadcrumbs: z.array(z.string()).optional().nullable(),
  })
  .passthrough();

const CitationSchema = z
  .object({
    number: z.number(),
    record: RecordSchema,
  })
  .passthrough();

const InkeepRecordsCitedDataSchema = z
  .object({
    citations: z.array(CitationSchema),
  })
  .passthrough();

export type InkeepRecordsCitedData = z.infer<
  typeof InkeepRecordsCitedDataSchema
>;

export type InkeepChatResultCallbacks = {
  onFinal?: (
    completion: string,
    metadata?: OnFinalInkeepMetadata,
  ) => Promise<void> | void;
  onRecordsCited?: (recordsCited: InkeepRecordsCitedData) => void;
};

export type InkeepAIStreamCallbacksAndOptions = AIStreamCallbacksAndOptions &
  InkeepChatResultCallbacks;

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

  let { onRecordsCited, ...passThroughCallbacks } = callbacks || {};

  // extend onFinal callback with Inkeep specific metadata
  passThroughCallbacks = {
    ...passThroughCallbacks,
    onFinal: completion => {
      const onFinalInkeepMetadata: OnFinalInkeepMetadata = {
        chat_session_id,
      };
      callbacks?.onFinal?.(completion, onFinalInkeepMetadata);
    },
    onEvent: e => {
      if (callbacks?.onEvent) {
        callbacks.onEvent(e);
      }
      if (callbacks?.onRecordsCited) {
        if (e.type === 'event') {
          if (e.event === 'records_cited') {
            callbacks.onRecordsCited(
              InkeepRecordsCitedDataSchema.parse(JSON.parse(e.data)),
            );
          }
        }
      }
    },
  };

  return AIStream(res, inkeepEventParser, passThroughCallbacks).pipeThrough(
    createStreamDataTransformer(passThroughCallbacks?.experimental_streamData),
  );
}
