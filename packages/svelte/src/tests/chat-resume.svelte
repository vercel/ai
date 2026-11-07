<script lang="ts">
  import { Chat, type ChatOptions } from '../chat.svelte.js';

  let { options }: { options: ChatOptions } = $props();

  function createChat() {
    return new Chat(options);
  }

  const chat = createChat();

  export { chat };
</script>
