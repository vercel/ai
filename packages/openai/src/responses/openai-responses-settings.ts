export const openaiResponsesReasoningModelIds = [
  'o1',
  'o1-2024-12-17',
  'o3-mini',
  'o3-mini-2025-01-31',
  'o3',
  'o3-2025-04-16',
  'o4-mini',
  'o4-mini-2025-04-16',
  'codex-mini-latest',
  'computer-use-preview',
  'gpt-5',
  'gpt-5-2025-08-07',
  'gpt-5-mini',
  'gpt-5-mini-2025-08-07',
  'gpt-5-nano',
  'gpt-5-nano-2025-08-07',
  'gpt-5-chat-latest',
] as const;

export const openaiResponsesModelIds = [
  'gpt-4.1',
  'gpt-4.1-2025-04-14',
  'gpt-4.1-mini',
  'gpt-4.1-mini-2025-04-14',
  'gpt-4.1-nano',
  'gpt-4.1-nano-2025-04-14',
  'gpt-4o',
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-11-20',
  'gpt-4o-audio-preview',
  'gpt-4o-audio-preview-2024-10-01',
  'gpt-4o-audio-preview-2024-12-17',
  'gpt-4o-search-preview',
  'gpt-4o-search-preview-2025-03-11',
  'gpt-4o-mini-search-preview',
  'gpt-4o-mini-search-preview-2025-03-11',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',
  'gpt-4-turbo-preview',
  'gpt-4-0125-preview',
  'gpt-4-1106-preview',
  'gpt-4',
  'gpt-4-0613',
  'gpt-4.5-preview',
  'gpt-4.5-preview-2025-02-27',
  'gpt-3.5-turbo-0125',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-1106',
  'chatgpt-4o-latest',
  ...openaiResponsesReasoningModelIds,
] as const;

export type OpenAIResponsesModelId =
  | 'o1'
  | 'o1-2024-12-17'
  | 'o3-mini'
  | 'o3-mini-2025-01-31'
  | 'o3'
  | 'o3-2025-04-16'
  | 'gpt-5'
  | 'gpt-5-2025-08-07'
  | 'gpt-5-mini'
  | 'gpt-5-mini-2025-08-07'
  | 'gpt-5-nano'
  | 'gpt-5-nano-2025-08-07'
  | 'gpt-5-chat-latest'
  | 'gpt-4.1'
  | 'gpt-4.1-2025-04-14'
  | 'gpt-4.1-mini'
  | 'gpt-4.1-mini-2025-04-14'
  | 'gpt-4.1-nano'
  | 'gpt-4.1-nano-2025-04-14'
  | 'gpt-4o'
  | 'gpt-4o-2024-05-13'
  | 'gpt-4o-2024-08-06'
  | 'gpt-4o-2024-11-20'
  | 'gpt-4o-mini'
  | 'gpt-4o-mini-2024-07-18'
  | 'gpt-4-turbo'
  | 'gpt-4-turbo-2024-04-09'
  | 'gpt-4'
  | 'gpt-4-0613'
  | 'gpt-3.5-turbo-0125'
  | 'gpt-3.5-turbo'
  | 'gpt-3.5-turbo-1106'
  | 'chatgpt-4o-latest'
  | (string & {});
