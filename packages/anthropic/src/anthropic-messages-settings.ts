// https://docs.anthropic.com/claude/docs/models-overview
export type AnthropicMessagesModelId =
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307'
  | (string & {});

export interface AnthropicMessagesSettings {
  /**
Only sample from the top K options for each subsequent token.

Used to remove "long tail" low probability responses. 
Recommended for advanced use cases only. You usually only need to use temperature.
   */
  topK?: number;
}
