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

export interface AIStreamParser {
  (data: string): string | void
}