// https://inference-docs.cerebras.ai/models/overview
export type CerebrasChatModelId =
  // production
  | 'gpt-oss-120b'
  | 'gemma-4-31b'
  // preview
  | 'zai-glm-4.7'
  | (string & {});
