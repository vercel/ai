// https://docs.cohere.com/docs/models
export type CohereChatModelId =
  | 'command-r-plus'
  | 'command-r'
  | 'command'
  | 'command-light'
  | (string & {});

export interface CohereChatSettings {}
