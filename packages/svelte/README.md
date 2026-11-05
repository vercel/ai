# AI SDK - Svelte integration

[Svelte](https://svelte.dev/) UI components for the [AI SDK](https://ai-sdk.dev/docs):

## Setup

```bash
npm i ai @ai-sdk/svelte
```

## Usage

```svelte
<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';

  let input = '';
  const chat = new Chat({});

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    chat.sendMessage({ text: input });
    input = '';
  }
</script>

<main>
  <ul>
    {#each chat.messages as message, messageIndex (messageIndex)}
      <li>
        <div>{message.role}</div>
        <div>
          {#each message.parts as part, partIndex (partIndex)}
            {#if part.type === 'text'}
              <div>{part.text}</div>
            {/if}
          {/each}
        </div>
      </li>
    {/each}
  </ul>
  <form onsubmit={handleSubmit}>
    <input bind:value={input} />
    <button type="submit">Send</button>
  </form>
</main>
```

See the [Svelte documentation](https://ai-sdk.dev/docs/getting-started/svelte) for more information.
