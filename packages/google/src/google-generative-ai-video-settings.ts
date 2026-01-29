export type GoogleGenerativeAIVideoModelId =
  | 'veo-3.1-generate-preview'
  | 'veo-3.1-generate'
  | (string & {});

export const GoogleGenerativeAIVideoModels = {
  VEO_3_1_PREVIEW: 'veo-3.1-generate-preview',
  VEO_3_1: 'veo-3.1-generate',
} as const;

export interface GoogleGenerativeAIVideoSettings {}
