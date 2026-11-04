import type { UIMessage } from 'ai';
import { expectTypeOf, it } from 'vitest';
import {
  WorkflowChatTransport,
  type WorkflowChatTransportOptions,
} from './client.js';

it('accepts a synchronous or asynchronous terminal stop predicate', () => {
  const synchronousOptions: WorkflowChatTransportOptions<UIMessage> = {
    stopWhen: () => true,
  };
  const asynchronousOptions: WorkflowChatTransportOptions<UIMessage> = {
    stopWhen: async () => false,
  };

  expectTypeOf(synchronousOptions.stopWhen).toEqualTypeOf<
    (() => boolean | PromiseLike<boolean>) | undefined
  >();

  new WorkflowChatTransport(synchronousOptions);
  new WorkflowChatTransport(asynchronousOptions);
});
