import { type AIMessageChunk } from '@langchain/core/messages';

/**
 * State for LangGraph event processing
 */
export interface LangGraphEventState {
  /** Tracks which message IDs have been seen */
  messageSeen: Record<
    string,
    { text?: boolean; reasoning?: boolean; tool?: Record<string, boolean> }
  >;
  /** Accumulates message chunks for later reference */
  messageConcat: Record<string, AIMessageChunk>;
  /** Maps tool call IDs to their message IDs (for chunks that don't include the ID) */
  emittedToolCalls: Set<string>;
  /** Maps image IDs to their message IDs (for chunks that don't include the ID) */
  emittedImages: Set<string>;
  /** Maps reasoning block IDs to their message IDs (for chunks that don't include the ID) */
  emittedReasoningIds: Set<string>;
  /** Maps message IDs to their reasoning block IDs (for chunks that don't include the ID) */
  messageReasoningIds: Record<string, string>;
  /** Maps message ID + tool call index to tool call info (for streaming chunks without ID) */
  toolCallInfoByIndex: Record<
    string,
    Record<number, { id: string; name: string }>
  >;
  /** Tracks the current LangGraph step for start-step/finish-step events */
  currentStep: number | null;
  /** Maps tool call key (name:argsJson) to tool call ID for HITL interrupt handling */
  emittedToolCallsByKey: Map<string, string>;
}

/**
 * Type for reasoning content block from LangChain
 */
export interface ReasoningContentBlock {
  type: 'reasoning';
  reasoning: string;
}

/**
 * Type for thinking content block from LangChain (Anthropic-style)
 */
export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

/**
 * Type for GPT-5 reasoning output block
 */
export interface GPT5ReasoningOutput {
  id: string;
  type: 'reasoning';
  summary: {
    type: 'summary_text';
    text: string;
  }[];
}

/**
 * Type for image generation tool outputs from LangChain/OpenAI
 */
export interface ImageGenerationOutput {
  id: string;
  type: 'image_generation_call';
  status: string;
  result?: string; // base64 image data
  revised_prompt?: string;
  size?: string;
  output_format?: string;
  quality?: string;
  background?: string;
}
