<script lang="ts">
  import { defaultChatStore } from 'ai';
  import { Chat } from '../chat.svelte.js';
  import { createAIContext } from '../context-provider.js';

  let { chatId }: { chatId?: string } = $props();

  createAIContext(defaultChatStore({ api: '/api/chat' }));
  const chat1 = new Chat(() => ({ chatId }));
  const chat2 = new Chat(() => ({ chatId }));

  export { chat1, chat2 };
</script>
