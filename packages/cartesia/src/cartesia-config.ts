import type {
  Resolvable,
  FetchFunction,
  WebSocketConstructor,
} from '@ai-sdk/provider-utils';

export type CartesiaConfig = {
  provider: string;
  url: (options: { modelId: string; path: string }) => string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  version?: string;
  webSocket?: WebSocketConstructor;
  generateId?: () => string;
};
