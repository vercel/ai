// https://docs.cohere.com/docs/models
export type CohereChatModelId =
  | 'command-a-03-2025'
  | 'command-r7b-12-2024'
  | 'command-r-plus-04-2024'
  | 'command-r-plus'
  | 'command-r-08-2024'
  | 'command-r-03-2024'
  | 'command-r'
  | 'command'
  | 'command-nightly'
  | 'command-light'
  | 'command-light-nightly'
  | (string & {});

export interface CohereChatSettings {}
