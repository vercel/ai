import type {
  Resolvable,
  FetchFunction,
  WebSocketConstructor,
} from '@ai-sdk/provider-utils';

export type DeepgramConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  webSocket?: WebSocketConstructor;
  generateId?: () => string;
};
