import type { CompactionCheckpoint, ModelMessage, UIMessage } from 'ai';

export type ConversationState = {
  messages: ModelMessage[];
  checkpoint?: CompactionCheckpoint;
};

export type CompactionChatMessage = UIMessage<
  never,
  {
    compaction: {
      status: 'running' | 'complete' | 'skipped';
      beforeMessages: number;
      afterMessages?: number;
    };
    context: ConversationState;
  }
>;
