import { openaiResponsesChunkSchema } from './openai-responses-api';
import { InferSchema } from '@ai-sdk/provider-utils';

type OpenaiResponsesChunk = InferSchema<typeof openaiResponsesChunkSchema>;

type ResponsesOutputTextAnnotationProviderMetadata = Extract<
  OpenaiResponsesChunk,
  { type: 'response.output_text.annotation.added' }
>['annotation'];

export type ResponsesTextProviderMetadata = {
  itemId: string;
  annotations?: Array<ResponsesOutputTextAnnotationProviderMetadata>;
};

export type OpenaiResponsesTextProviderMetadata = {
  openai: ResponsesTextProviderMetadata;
};

export type ResponsesSourceDocumentProviderMetadata =
  | {
      type: 'file_citation';
      fileId: string;
      filename: string;
      index: number;
    }
  | {
      type: 'container_file_citation';
      fileId: string;
      containerId: string;
      filename: string;
    }
  | {
      type: 'file_path';
      fileId: string;
      index: number;
    };

export type OpenaiResponsesSourceDocumentProviderMetadata = {
  openai: ResponsesSourceDocumentProviderMetadata;
};
