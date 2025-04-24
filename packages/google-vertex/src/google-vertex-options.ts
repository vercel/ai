// https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#supported-models
// Note preview and experimental models may only be detailed in AI Studio:
// https://console.cloud.google.com/vertex-ai/studio/
export type GoogleVertexModelId =
  // Stable models
  | 'gemini-2.0-flash-001'
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
  // Preview models
  | 'gemini-2.0-flash-lite-preview-02-05'
  // Experimental models
  | 'gemini-2.0-pro-exp-02-05'
  | 'gemini-2.0-flash-exp'
  | (string & {});
