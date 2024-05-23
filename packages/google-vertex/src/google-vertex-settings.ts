// https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models
export type GoogleVertexModelId =
  // not GA accessible / tested:
  // | 'gemini-1.5-flash'
  // | 'gemini-1.5-pro'
  'gemini-1.0-pro' | 'gemini-1.0-pro-vision' | (string & {});

export interface GoogleVertexSettings {
  /**
Optional. The maximum number of tokens to consider when sampling.

Models use nucleus sampling or combined Top-k and nucleus sampling. 
Top-k sampling considers the set of topK most probable tokens. 
Models running with nucleus sampling don't allow topK setting.
   */
  topK?: number;
}
