// packages/core/streams/inkeep-stream.ts
import {
  AIStream,
  type AIStreamCallbacksAndOptions,
  AIStreamParser,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

export type InkeepOnFinalMetadata = {
  chat_session_id: string;
  records_cited: any;
};

export type InkeepChatResultCallbacks = {
  onFinal?: (
    completion: string,
    metadata?: InkeepOnFinalMetadata,
  ) => Promise<void> | void;
  onRecordsCited?: (
    records_cited: InkeepOnFinalMetadata['records_cited'],
  ) => void;
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
  let records_cited: any;

  const inkeepEventParser: AIStreamParser = (data: string, options) => {
    const { event } = options;

    if (event === 'records_cited') {
      records_cited = JSON.parse(data) as any;
      callbacks?.onRecordsCited?.(records_cited);
    }

    if (event === 'message_chunk') {
      const inkeepMessageChunk = JSON.parse(data);
      chat_session_id = inkeepMessageChunk.chat_session_id ?? chat_session_id;
      return inkeepMessageChunk.content_chunk;
    }
    return;
  };

  let { onRecordsCited, ...passThroughCallbacks } = callbacks || {};

  // extend onFinal callback with Inkeep specific metadata
  passThroughCallbacks = {
    ...passThroughCallbacks,
    onFinal: completion => {
      const inkeepOnFinalMetadata: InkeepOnFinalMetadata = {
        chat_session_id,
        records_cited,
      };
      callbacks?.onFinal?.(completion, inkeepOnFinalMetadata);
    },
  };

  return AIStream(res, inkeepEventParser, passThroughCallbacks).pipeThrough(
    createStreamDataTransformer(),
  );
}
