// https://developers.inflection.ai/docs
export type InflectionChatModelId =
  | 'inflection_3_with_tools'
  | 'inflection_3_pi'
  | 'inflection_3_productivity'
  | (string & {});

export interface InflectionChatSettings {
  /**
   * Optional metadata about the user that the AI can utilize
   */
  metadata?: {
    /** The user's first name */
    user_firstname?: string;
    /** The user's timezone, e.g. "America/Los_Angeles" */
    user_timezone?: string;
    /** The user's country, e.g. England */
    user_country?: string;
    /** The user's region within their country, e.g. "CA" for California */
    user_region?: string;
    /** The user's city, e.g. "San Francisco" */
    user_city?: string;
  };

  /**
   * Whether to allow web search. Defaults to true.
   */
  web_search?: boolean;

  /**
   * Controls randomness in the model's output. Higher values (e.g., 0.8) make the
   * output more random, while lower values (e.g., 0.2) make it more deterministic.
   * Defaults to 1.0.
   */
  temperature?: number;

  /**
   * Sequences that will cause the model to stop generating further tokens.
   */
  stop_tokens?: string[];

  /**
   * The maximum number of tokens to generate. Defaults to 1024.
   */
  max_tokens?: number;

  /**
   * Controls diversity via nucleus sampling. Defaults to 0.95.
   */
  top_p?: number;
}
