import type {
  FetchFunction,
  Resolvable,
  WebSocketConstructor,
} from '@ai-sdk/provider-utils';

export type GatewayConfig = {
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  webSocket?: WebSocketConstructor;
  /**
   * Request body encoding. 'cbor' sends prompts containing inline file bytes
   * as `application/cbor` (no base64 inflation); 'json' (default) always
   * base64-encodes into JSON. Only used by the language model today.
   */
  encoding?: 'json' | 'cbor';
};
