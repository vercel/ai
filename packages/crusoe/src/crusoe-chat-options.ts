// https://docs.crusoecloud.com/managed-inference/overview
export type CrusoeChatModelId =
  | 'deepseek-ai/DeepSeek-V3-0324'
  | 'deepseek-ai/Deepseek-V4-Flash'
  | 'deepseek-ai/DeepSeek-V4-Pro'
  | 'google/gemma-4-31b-it'
  | 'meta-llama/Llama-3.3-70B-Instruct'
  | 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'
  | 'nvidia/Nemotron-3-Nano-Omni-Reasoning-30B-A3B'
  | 'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B'
  | 'nvidia/NVIDIA-Nemotron-3-Ultra-550B'
  | 'openai/gpt-oss-120b'
  | 'Qwen/Qwen3-235B-A22B-Instruct-2507'
  | 'yutori/n1.5'
  | 'zai/GLM-5.1'
  | (string & {});
