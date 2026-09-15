import { describe, expectTypeOf, it } from 'vitest';
import type { UIMessage, UseChatOptions } from './use-chat';

describe('UseChatOptions throttle', () => {
  it('accepts an omitted throttle', () => {
    const options = {} satisfies UseChatOptions<UIMessage>;

    expectTypeOf(options).toMatchTypeOf<UseChatOptions<UIMessage>>();
  });

  it('accepts zero as the unthrottled opt-out', () => {
    const options = { throttle: 0 } satisfies UseChatOptions<UIMessage>;

    expectTypeOf(options).toMatchTypeOf<UseChatOptions<UIMessage>>();
  });

  it('accepts a custom publication cadence', () => {
    const options = { throttle: 100 } satisfies UseChatOptions<UIMessage>;

    expectTypeOf(options).toMatchTypeOf<UseChatOptions<UIMessage>>();
  });
});
