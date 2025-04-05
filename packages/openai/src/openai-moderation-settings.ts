export type OpenAIModerationModelId =
  | 'omni-moderation-latest'
  | 'omni-moderation-2024-09-26'
  | 'text-moderation-latest'
  | 'text-moderation-stable'
  | (string & {});

export interface OpenAIModerationSettings {
  /**
   * A unique identifier representing your end-user, which can help OpenAI to
   * monitor and detect abuse.
   */
  user?: string;
}
