// Serverless model IDs are prefixed with `parasail-`. Availability changes
// frequently; the live list is served by https://api.parasail.io/v1/models
// https://docs.parasail.io/parasail-docs/api-reference/models-endpoint
export type ParasailChatModelId =
  | 'parasail-deepseek-r1'
  | 'parasail-llama-33-70b-fp8'
  | 'parasail-llama-4-scout-instruct'
  | 'parasail-llama-4-maverick-instruct-fp8'
  | 'parasail-qwen3-30b-a3b'
  | 'parasail-qwen3-235b-a22b'
  | 'parasail-qwen3-32b'
  | 'parasail-gemma3-27b-it'
  | 'parasail-mistral-devstral-small'
  // dedicated deployments and Hugging Face models (batch/dedicated) use
  // arbitrary IDs such as a deployment name or `org/model`
  | (string & {});
