// https://ai.google.dev/models/gemini
export type GoogleGenerativeAIModelId =
  | 'models/gemini-1.5-pro-latest'
  | 'models/gemini-pro'
  | 'models/gemini-pro-vision'
  | (string & {});

export interface GoogleGenerativeAISettings {
  topK?: number;
}
