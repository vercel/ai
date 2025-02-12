// matches the registry
export type RemoteModelId =
  | 'openai/gpt-4o'
  | 'openai/gpt-4o-mini'
  | 'anthropic/claude-3-5-haiku-20241022'
  | (string & {});
