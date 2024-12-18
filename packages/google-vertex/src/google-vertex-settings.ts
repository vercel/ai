import type { InternalGoogleGenerativeAISettings } from '@ai-sdk/google/internal';

// https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#supported-models
export type GoogleVertexModelId =
  | 'gemini-2.0-flash-exp'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-flash-001'
  | 'gemini-1.5-flash-002'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-pro-001'
  | 'gemini-1.5-pro-002'
  | 'gemini-1.0-pro-001'
  | 'gemini-1.0-pro-vision-001'
  | 'gemini-1.0-pro'
  | 'gemini-1.0-pro-001'
  | 'gemini-1.0-pro-002'
  | (string & {});

export interface GoogleVertexSettings
  extends InternalGoogleGenerativeAISettings {}
