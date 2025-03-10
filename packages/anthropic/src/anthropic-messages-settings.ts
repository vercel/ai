// https://docs.anthropic.com/claude/docs/models-overview
export type AnthropicMessagesModelId =
  | 'claude-3-7-sonnet-20250219'
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
Enable Anthropic cache control. This will allow you to use provider-specific
`cacheControl` metadata.

@deprecated cache control is now enabled by default (meaning you are able to
optionally mark content for caching) and this setting is no longer needed.
*/
  cacheControl?: boolean;

  /**
Include reasoning content in requests sent to the model. Defaults to `true`.

If you are experiencing issues with the model handling requests involving
reasoning content, you can set this to `false` to omit them from the request.
  */
  sendReasoning?: boolean;
}
