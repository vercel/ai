<script lang="ts">
  import ArrowUp from '$lib/components/icons/arrow-up.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { Chat } from '@ai-sdk/svelte';

  const chat = new Chat();
  const disabled = $derived(chat.status !== 'ready');

  function mapRoleToClass(role: string) {
    return role === 'assistant'
      ? 'bg-primary text-secondary rounded-md'
      : 'bg-secondary text-primary rounded-md justify-self-end';
  }
</script>

<main class="flex flex-col items-center h-dvh w-dvw">
  <div
    class="grid h-full w-full max-w-4xl grid-cols-1 grid-rows-[1fr,120px] p-2"
  >
    <div class="w-full h-full overflow-y-auto">
      {#each chat.messages as message (message.id)}
        <div class="{mapRoleToClass(message.role)} my-2 max-w-[80%] p-2">
          {message.content}
        </div>
      {/each}
    </div>
    <form class="relative" onsubmit={chat.handleSubmit}>
      <Textarea
        bind:value={chat.input}
        placeholder="Send a message..."
        class="h-full"
        onkeydown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            chat.handleSubmit();
          }
        }}
      />
      <Button
        aria-label="Send message"
        {disabled}
        type="submit"
        size="icon"
        class="absolute bottom-3 right-3"
      >
        <ArrowUp />
      </Button>
    </form>
  </div>
</main>
