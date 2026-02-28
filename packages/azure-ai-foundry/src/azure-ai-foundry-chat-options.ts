export type AzureAIFoundryChatModelId =
  // OpenAI GPT-5.2 series
  | 'gpt-5.2'
  | 'gpt-5.2-codex'
  | 'gpt-5.2-chat'
  // OpenAI GPT-5.1 series
  | 'gpt-5.1'
  | 'gpt-5.1-chat'
  | 'gpt-5.1-codex'
  | 'gpt-5.1-codex-mini'
  | 'gpt-5.1-codex-max'
  // OpenAI GPT-5 series
  | 'gpt-5'
  | 'gpt-5-mini'
  | 'gpt-5-nano'
  | 'gpt-5-chat'
  | 'gpt-5-codex'
  | 'gpt-5-pro'
  // OpenAI GPT-4.1 series
  | 'gpt-4.1'
  | 'gpt-4.1-mini'
  | 'gpt-4.1-nano'
  // OpenAI GPT-4o series
  | 'gpt-4o'
  | 'gpt-4o-mini'
  // OpenAI o-series reasoning models
  | 'o4-mini'
  | 'o3'
  | 'o3-pro'
  | 'o3-mini'
  | 'o1'
  | 'codex-mini'
  // Anthropic Claude models
  | 'claude-opus-4-5'
  | 'claude-sonnet-4-5'
  | 'claude-haiku-4-5'
  | 'claude-opus-4-1'
  | 'claude-opus-4-6'
  // Meta models
  | 'Llama-4-Maverick-17B-128E-Instruct-FP8'
  | 'Llama-3.3-70B-Instruct'
  // DeepSeek models
  | 'DeepSeek-V3.2'
  | 'DeepSeek-V3.2-Speciale'
  | 'DeepSeek-V3.1'
  | 'DeepSeek-V3-0324'
  | 'DeepSeek-R1-0528'
  | 'DeepSeek-R1'
  // xAI Grok models
  | 'grok-4'
  | 'grok-4-fast-reasoning'
  | 'grok-4-fast-non-reasoning'
  | 'grok-code-fast-1'
  | 'grok-3'
  | 'grok-3-mini'
  // Mistral models
  | 'Mistral-Large-3'
  | 'mistral-document-ai-2505'
  // Cohere models
  | 'Cohere-command-a'
  // Moonshot AI models
  | 'Kimi-K2.5'
  | 'Kimi-K2-Thinking'
  // Microsoft models
  | 'MAI-DS-R1'
  | 'model-router'
  // Catch-all for custom deployment names
  | (string & {});
