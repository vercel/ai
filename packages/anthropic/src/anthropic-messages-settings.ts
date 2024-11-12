// https://docs.anthropic.com/claude/docs/models-overview
export type AnthropicMessagesModelId =
  | 'claude-3-5-sonnet-latest'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-sonnet-20240620'
  | 'claude-3-5-haiku-latest'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-latest'
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307'
  | (string & {});

export interface AnthropicMessagesSettings {
  /**
Enable Anthropic cache control (beta feature). This will add the beta header and
allow you to use provider-specific cacheControl metadata.
   */
  cacheControl?: boolean;
}
