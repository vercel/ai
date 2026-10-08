import type { WebSocketConstructor } from '@ai-sdk/provider-utils';
import { expectTypeOf, it } from 'vitest';
import {
  safeValidateWebSocketChatTransportRequest,
  WebSocketChatTransport,
  type AbstractChat,
  type ChatTransport,
  type SafeValidateWebSocketChatTransportRequestResult,
  type UIMessage,
  type WebSocketChatTransportRequest,
  type WebSocketChatTransportResponse,
} from '..';

it('implements ChatTransport and exposes typed protocol frames', () => {
  const transport = new WebSocketChatTransport<UIMessage>({
    url: 'wss://example.com/chat',
    webSocket: undefined as WebSocketConstructor | undefined,
    prepareSendMessagesRequest: ({ messages, headers, body }) => {
      expectTypeOf(messages).toEqualTypeOf<UIMessage[]>();
      expectTypeOf(headers).toEqualTypeOf<Record<string, string>>();
      expectTypeOf(body).toEqualTypeOf<object>();
      return { messages, headers, body };
    },
  });

  expectTypeOf(transport).toMatchTypeOf<ChatTransport<UIMessage>>();
  expectTypeOf(transport.close).toEqualTypeOf<() => void>();
  expectTypeOf<ChatTransport<UIMessage>['close']>().toEqualTypeOf<
    (() => void) | undefined
  >();
  expectTypeOf<AbstractChat<UIMessage>['dispose']>().toEqualTypeOf<
    () => Promise<void>
  >();

  expectTypeOf<WebSocketChatTransportRequest<UIMessage>>().toMatchTypeOf<
    | { type: 'send'; requestId: string }
    | { type: 'resume'; requestId: string }
    | { type: 'abort'; requestId: string }
  >();
  expectTypeOf<WebSocketChatTransportResponse>().toMatchTypeOf<
    | { type: 'start'; requestId: string }
    | { type: 'chunk'; requestId: string; sequence: number }
    | { type: 'end'; requestId: string }
    | { type: 'error'; requestId: string }
    | { type: 'no-active'; requestId: string }
  >();

  expectTypeOf(
    safeValidateWebSocketChatTransportRequest<UIMessage>({
      value: {},
    }),
  ).resolves.toEqualTypeOf<
    SafeValidateWebSocketChatTransportRequestResult<UIMessage>
  >();
});
