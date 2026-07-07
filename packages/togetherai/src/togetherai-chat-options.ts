// https://docs.together.ai/docs/serverless-models#chat-models
export type TogetherAIChatModelId =
  // DeepSeek
  | 'deepseek-ai/DeepSeek-V4-Pro'
  | 'deepseek-ai/DeepSeek-V3.1'
  | 'deepseek-ai/DeepSeek-R1'
  // Z.ai
  | 'zai-org/GLM-5.1'
  | 'zai-org/GLM-5'
  // Moonshot / Kimi
  | 'moonshotai/Kimi-K2.6'
  | 'moonshotai/Kimi-K2.5'
  // MiniMax
  | 'MiniMaxAI/MiniMax-M2.7'
  // Qwen
  | 'Qwen/Qwen3.6-Plus'
  | 'Qwen/Qwen3.5-397B-A17B'
  | 'Qwen/Qwen3-Coder-Next-FP8'
  | 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8'
  | 'Qwen/Qwen3-235B-A22B-Instruct-2507-tput'
  | 'Qwen/Qwen3.5-9B'
  | 'Qwen/Qwen2.5-7B-Instruct-Turbo'
  // OpenAI OSS
  | 'openai/gpt-oss-120b'
  | 'openai/gpt-oss-20b'
  // Meta
  | 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
  | 'meta-llama/Meta-Llama-3-8B-Instruct-Lite'
  // Google
  | 'google/gemma-4-31B-it'
  | 'google/gemma-3n-E4B-it'
  // LiquidAI
  | 'LiquidAI/LFM2-24B-A2B'
  // Essential AI
  | 'essentialai/rnj-1-instruct'
  // Deepcogito
  | 'deepcogito/cogito-v2-1-671b'
  // Arize AI
  | 'arize-ai/qwen-2-1.5b-instruct'
  | (string & {});
