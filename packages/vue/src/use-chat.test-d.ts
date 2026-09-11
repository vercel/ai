import type { UIMessage } from 'ai';
import { ref } from 'vue';
import { expectTypeOf } from 'vitest';
import { useChat, type UseChatOptions } from './use-chat';

const options = {
  throttle: 50,
} satisfies UseChatOptions<UIMessage>;

expectTypeOf(options.throttle).toEqualTypeOf<number>();

useChat(options);
useChat(ref(options));
useChat(() => options);
