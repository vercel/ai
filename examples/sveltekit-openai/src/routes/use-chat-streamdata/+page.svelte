<script lang="ts">
  import { useChat } from '@ai-sdk/svelte';

  const {
    error,
    input,
    isLoading,
    handleSubmit,
    messages,
    data,
    setData
  } = useChat({ api: '/api/use-chat-streamdata' });
</script>

<svelte:head>
  <title>Home</title>
  <meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
  <h1>useChat</h1>

  {#if $data}
    <pre class="p-4 text-sm bg-gray-100">
      {JSON.stringify($data, null, 2)}
    </pre>
    <button
      on:click={() => setData(undefined)}
      class="px-4 py-2 mt-2 text-white bg-blue-500 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
    >
      Clear Data
    </button>
  {/if}

  <ul>
    {#each $messages as message}
      <li class="whitespace-pre-wrap">
        <strong>{message.role}: </strong>
        {message.content}
      </li>
    {/each}
  </ul>

  <form on:submit={handleSubmit}>
    <input
      bind:value={$input}
      disabled={$isLoading || $error != null}
      class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
      placeholder="Say something..."
    />
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
