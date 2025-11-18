// https://inference-docs.cerebras.ai/models/overview
export type CerebrasChatModelId =
  // production
  | 'llama3.1-8b'
  | 'llama-3.3-70b'
  | 'gpt-oss-120b'
  | 'qwen-3-32b'
  // preview
  | 'qwen-3-235b-a22b-instruct-2507'
  | 'qwen-3-235b-a22b-thinking-2507'
  | 'zai-glm-4.6'
  | (string & {});
