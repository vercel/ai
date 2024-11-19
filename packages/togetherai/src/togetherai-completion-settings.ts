import { OpenAICompatCompletionSettings } from '@ai-sdk/openai-compat';

// https://docs.together.ai/docs/serverless-models#language-models
export type TogetherAICompletionModelId =
  | 'codellama/CodeLlama-34b-Instruct-hf'
  | 'Qwen/Qwen2.5-Coder-32B-Instruct'
  | (string & {});

// https://docs.together.ai/docs/dedicated-models#language-models
// export type TogetherAICompletionModelId =
//   | 'allenai/OLMo-7B-Instruct'
//   | 'EleutherAI/llemma_7b'
//   | 'google/gemma-2-9b'
//   | 'google/gemma-2b'
//   | 'google/gemma-7b'
//   | 'gpt-3.5-turbo-instruct'
//   | 'huggyllama/llama-13b'
//   | 'huggyllama/llama-30b'
//   | 'huggyllama/llama-65b'
//   | 'huggyllama/llama-7b'
//   | 'meta-llama/Llama-2-13b-hf'
//   | 'meta-llama/Llama-2-70b-hf'
//   | 'meta-llama/Llama-2-7b-hf'
//   | 'meta-llama/Llama-3-8b-hf'
//   | 'meta-llama/Meta-Llama-3-70b-hf'
//   | 'meta-llama/Meta-Llama-3-70B'
//   | 'meta-llama/Meta-Llama-3-8B'
//   | 'meta-llama/Meta-Llama-3.1-70B-Reference'
//   | 'meta-llama/Meta-Llama-3.1-8B-Reference'
//   | 'microsoft/phi-2'
//   | 'mistralai/Mistral-7B-v0.1'
//   | 'mistralai/Mixtral-8x22B'
//   | 'mistralai/Mixtral-8x7B-v0.1'
//   | 'Nexusflow/NexusRaven-V2-13B'
//   | 'NousResearch/Nous-Hermes-13b'
//   | 'Qwen/Qwen1.5-0.5B'
//   | 'Qwen/Qwen1.5-1.8B'
//   | 'Qwen/Qwen1.5-14B'
//   | 'Qwen/Qwen1.5-32B'
//   | 'Qwen/Qwen1.5-4B'
//   | 'Qwen/Qwen1.5-72B'
//   | 'Qwen/Qwen1.5-7B'
//   | 'Qwen/Qwen2-1.5B'
//   | 'Qwen/Qwen2-72B'
//   | 'Qwen/Qwen2-7B'
//   | 'togethercomputer/evo-1-131k-base'
//   | 'togethercomputer/evo-1-8k-base'
//   | 'togethercomputer/llama-2-13b'
//   | 'togethercomputer/llama-2-70b'
//   | 'togethercomputer/LLaMA-2-7B-32K'
//   | 'togethercomputer/llama-2-7b'
//   | 'togethercomputer/StripedHyena-Hessian-7B'
//   | 'WizardLM/WizardLM-70B-V1.0'
//   | 'zero-one-ai/Yi-34B'
//   | 'zero-one-ai/Yi-6B'
//   | (string & {});

export interface TogetherAICompletionSettings
  extends OpenAICompatCompletionSettings {}
