// https://docs.anthropic.com/claude/docs/models-overview
export type AnthropicMessagesModelId =
  | 'claude-3-5-sonnet-20240620'
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307'
  | (string & {});

export interface AnthropicMessagesSettings {
  /**
Only sample from the top K options for each subsequent token.

Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.

@deprecated use the topK setting on the request instead.
   */
  topK?: number;

  /**
Enable Anthropic cache control (beta feature). This will add the beta header and
allow you to use provider-specific cacheControl metadata.
   */
  cacheControl?: boolean;
}
