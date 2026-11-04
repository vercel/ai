import { expectTypeOf, it } from 'vitest';
import type { UIMessage } from 'ai';
import {
  WorkflowChatTransport,
  type WorkflowChatTransportOptions,
} from './client.js';

it('types the reconnect permission callback', () => {
  const options: WorkflowChatTransportOptions<UIMessage> = {
    waitUntilReconnectAllowed: ({ abortSignal }) => {
      expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal>();
      return Promise.resolve();
    },
  };

  expectTypeOf(new WorkflowChatTransport(options)).toEqualTypeOf<
    WorkflowChatTransport<UIMessage>
  >();
});
