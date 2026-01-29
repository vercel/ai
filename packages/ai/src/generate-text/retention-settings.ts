/**
 * Settings for controlling what data is retained in step results.
 * Disabling retention can help reduce memory usage when processing
 * large payloads like images.
 */
export type RetentionSettings = {
  /**
   * Whether to retain the request body in step results.
   * The request body can be large when sending images or files.
   * @default true
   */
  requestBody?: boolean;

  /**
   * Whether to retain the response body in step results.
   * @default true
   */
  responseBody?: boolean;
};
