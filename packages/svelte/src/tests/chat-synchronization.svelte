<script lang="ts">
  import { createChatStore } from '../chat-store.svelte.js';
  import { Chat } from '../chat.svelte.js';
  import { defaultChatStoreOptions } from 'ai';
  import { createAIContext } from '../context-provider.js';

  let { chatId }: { chatId?: string } = $props();

  createAIContext(
    createChatStore(defaultChatStoreOptions({ api: '/api/chat' })()),
  );
  const chat1 = new Chat(() => ({ chatId }));
  const chat2 = new Chat(() => ({ chatId }));

  export { chat1, chat2 };
</script>
