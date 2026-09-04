import type {
  FetchFunction,
  WebSocketConstructor,
} from '@ai-sdk/provider-utils';

export type AssemblyAIConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  /**
   * Builds the URL for the streaming (WebSocket) API. Defaults to the
   * `https://streaming.assemblyai.com` host.
   */
  streamingUrl?: (options: { modelId: string; path: string }) => string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  /**
   * Custom WebSocket implementation for streaming transcription.
   */
  webSocket?: WebSocketConstructor;
  generateId?: () => string;
};
