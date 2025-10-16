// https://inference-docs.cerebras.ai/introduction
export type CerebrasChatModelId =
  | 'llama-3.3-70b'
  | 'llama3.1-8b'
  | 'gpt-oss-120b'
  | 'qwen-3-235b-a22b-instruct-2507'
  | 'qwen-3-235b-a22b-thinking-2507'
  | 'qwen-3-32b'
  | 'qwen-3-coder-480b'
  | (string & {});
