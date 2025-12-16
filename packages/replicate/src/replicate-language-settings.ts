export type ReplicateLanguageModelId =
  // Meta Llama models
  | 'meta/meta-llama-3-70b-instruct'
  | 'meta/meta-llama-3-8b-instruct'
  | 'meta/meta-llama-3.1-405b-instruct'
  | 'meta/meta-llama-3.1-70b-instruct'
  | 'meta/meta-llama-3.1-8b-instruct'
  | 'meta/meta-llama-3.2-1b-instruct'
  | 'meta/meta-llama-3.2-3b-instruct'
  | 'meta/meta-llama-3.3-70b-instruct'
  // Mistral models
  | 'mistralai/mistral-7b-instruct-v0.2'
  | 'mistralai/mixtral-8x7b-instruct-v0.1'
  | 'mistralai/mixtral-8x22b-instruct-v0.1'
  // DeepSeek models
  | 'deepseek-ai/deepseek-r1'
  | 'deepseek-ai/deepseek-v3.1'
  // Qwen models
  | 'qwen/qwen-2.5-72b-instruct'
  | 'qwen/qwen2.5-coder-32b-instruct'
  // Other popular models
  | 'snowflake/snowflake-arctic-instruct'
  | 'ibm-granite/granite-3.3-8b-instruct'
  | (string & {});
