export type HuggingFaceResponsesModelId = string;

export interface HuggingFaceResponsesSettings {
  metadata?: Record<string, string>;
  instructions?: string;
  strictJsonSchema?: boolean;
}
