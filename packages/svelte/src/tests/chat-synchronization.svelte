<script lang="ts">
  import { Chat } from '../chat.svelte.js';
  import {
    createAIContext,
    createChatStoreContext,
  } from '../context-provider.js';

  let { chatId }: { chatId?: string } = $props();

  createAIContext();
  createChatStoreContext();
  const chat1 = new Chat({ chatId });
  const chat2 = new Chat({ chatId });

  export { chat1, chat2 };
</script>
