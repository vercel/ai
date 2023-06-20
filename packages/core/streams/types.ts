/**
 * Whether the stream should parse the content from an API response or return
 * it unmodified.
 */
export type AIStreamMode = 'raw' | 'text' | 'json'

/**
 * All of the configuration options for an AI stream.
 */
export interface AIStreamOptions extends AIStreamCallbacks {
  mode?: AIStreamMode
}

export interface AIStreamCallbacks {
  /**
   * Called when the stream starts.
   */
  onStart?: () => Promise<void>
  /**
   * Called when the stream is finished.
   *
   * @param completion The complete text response for this stream.
   */
  onCompletion?: (completion: string) => Promise<void>
  /**
   * Called when a token is received from the stream.
   *
   * @param token The token received.
   */
  onToken?: (token: string) => Promise<void>
}

export type AIStreamParser = null | ((data: string) => string | void)
