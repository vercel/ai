import type {
  openaiResponsesChunkSchema,
  OpenAIResponsesLogprobs,
} from './openai-responses-api';
import type { InferSchema } from '@ai-sdk/provider-utils';

type OpenaiResponsesChunk = InferSchema<typeof openaiResponsesChunkSchema>;

type ResponsesOutputTextAnnotationProviderMetadata = Extract<
  OpenaiResponsesChunk,
  { type: 'response.output_text.annotation.added' }
>['annotation'];

export type ResponsesProviderMetadata = {
  responseId: string | null | undefined;
  logprobs?: Array<OpenAIResponsesLogprobs>;
  serviceTier?: string;
  /**
   * Orchestration token usage details (e.g. Sakana-style orchestration) that
   * the Responses API reports alongside the standard usage. Surfaced here so
   * downstream consumers (e.g. the AI Gateway) can bill it.
   */
  usage?: ResponsesUsageProviderMetadata;
};

export type ResponsesUsageProviderMetadata = {
  orchestrationInputTokens?: number;
  orchestrationInputCachedTokens?: number;
  orchestrationOutputTokens?: number;
};

export type ResponsesReasoningProviderMetadata = {
  itemId: string;
  reasoningEncryptedContent?: string | null;
};

export type OpenaiResponsesReasoningProviderMetadata = {
  openai: ResponsesReasoningProviderMetadata;
};

export type OpenaiResponsesProviderMetadata = {
  openai: ResponsesProviderMetadata;
};

export type ResponsesTextProviderMetadata = {
  itemId: string;
  phase?: 'commentary' | 'final_answer' | null;
  annotations?: Array<ResponsesOutputTextAnnotationProviderMetadata>;
};

export type OpenaiResponsesTextProviderMetadata = {
  openai: ResponsesTextProviderMetadata;
};

export type ResponsesSourceDocumentProviderMetadata =
  | {
      type: 'file_citation';
      fileId: string;
      index: number;
    }
  | {
      type: 'container_file_citation';
      fileId: string;
      containerId: string;
    }
  | {
      type: 'file_path';
      fileId: string;
      index: number;
    };

export type OpenaiResponsesSourceDocumentProviderMetadata = {
  openai: ResponsesSourceDocumentProviderMetadata;
};
