export type WebSocketLike = {
  readyState: number;
  send(data: string | Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
};

export type WebSocketConstructor = new (
  url: string | URL,
  protocols?: string | string[],
  options?: {
    headers?: Record<string, string | undefined>;
  },
) => WebSocketLike;

export function getWebSocketConstructor(
  webSocket: WebSocketConstructor | undefined,
): WebSocketConstructor {
  const WebSocketConstructor =
    webSocket ?? (globalThis.WebSocket as unknown as WebSocketConstructor);

  if (WebSocketConstructor == null) {
    throw new Error('No WebSocket implementation available.');
  }

  return WebSocketConstructor;
}
