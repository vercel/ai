import type { UIMessage } from 'ai';
import { expectTypeOf, it } from 'vitest';
import type { WorkflowChatTransportOptions } from './workflow-chat-transport.js';

it('types retryDelayMs as a fixed delay or backoff callback', () => {
  type RetryDelayMs = NonNullable<
    WorkflowChatTransportOptions<UIMessage>['retryDelayMs']
  >;

  expectTypeOf<RetryDelayMs>().toEqualTypeOf<
    number | ((options: { consecutiveErrors: number }) => number)
  >();

  const options = {
    retryDelayMs: ({ consecutiveErrors }) =>
      Math.min(500 * 2 ** Math.max(0, consecutiveErrors - 1), 5_000),
  } satisfies WorkflowChatTransportOptions<UIMessage>;

  expectTypeOf(options.retryDelayMs).parameter(0).toEqualTypeOf<{
    consecutiveErrors: number;
  }>();
});
