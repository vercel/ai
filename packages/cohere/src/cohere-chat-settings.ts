// https://docs.cohere.com/docs/models
export type CohereChatModelId =
  | 'command-r-plus'
  | 'command-r-plus-08-2024'
  | 'command-r'
  | 'command-r-08-2024'
  | 'command-r-03-2024'
  | 'command'
  | 'command-nightly'
  | 'command-light'
  | 'command-light-nightly'
  | (string & {});

export interface CohereChatSettings {}
