<script lang="ts">
  import { Chat } from '$lib/chat.svelte.js';
  import { createAIContext } from '$lib/context-provider.js';

  let { id }: { id?: string } = $props();

  createAIContext();
  const chat1 = new Chat({ id });
  const chat2 = new Chat({ id });

  export { chat1, chat2 };
</script>
