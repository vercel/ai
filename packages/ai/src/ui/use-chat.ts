export type ChatRequestOptions = {
  /**
  Additional headers that should be to be passed to the API endpoint.
   */
  headers?: Record<string, string> | Headers;

  /**
  Additional body JSON properties that should be sent to the API endpoint.
   */
  body?: object;
};
