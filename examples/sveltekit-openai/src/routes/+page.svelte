<script lang="ts">
  import { useChat } from '@ai-sdk/svelte';

  const {
     error,
    input,
    isLoading,
    handleSubmit,
    messages,
    reload,
    stop
  } = useChat({
    onFinish(message, { usage, finishReason }) {
      console.log('Usage', usage);
      console.log('FinishReason', finishReason);
    },
  });
</script>

<svelte:head>
  <title>Home</title>
  <meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
  <h1>useChat</h1>
  <ul>
    {#each $messages as message}
      <li>{message.role}: {message.content}</li>
    {/each}
  </ul>

  {#if $isLoading}
    <div class="mt-4 text-gray-500">
      <div>Loading...</div>
      <button
        type="button"
        class="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
        on:click={stop}
      >
        Stop
      </button>
    </div>
  {/if}

  {#if $error}
    <div class="mt-4">
      <div class="text-red-500">An error occurred.</div>
      <button
        type="button"
        class="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
        on:click={() => reload()}
      >
        Retry
      </button>
    </div>
  {/if}

  <form on:submit={handleSubmit}>
    <input bind:value={$input} disabled={$isLoading || $error != null} />
    <button type="submit">Send</button>
  </form>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    flex: 0.6;
  }

  h1 {
    width: 100%;
  }
</style>
