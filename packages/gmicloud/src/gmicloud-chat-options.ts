// Catalog: GET https://api.gmi-serving.com/v1/models
export type GmicloudChatModelId =
  | 'deepseek-ai/DeepSeek-V4-Flash-0731'
  | 'Qwen/Qwen3.8-Max'
  | 'moonshotai/kimi-k3'
  | 'zai-org/GLM-5.2-FP8'
  | 'MiniMaxAI/MiniMax-M3'
  | (string & {});
