<script>
  import { useChat } from './use-chat';

  const { messages, append, data, error } = useChat();
</script>

<div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
  <div data-testid="error">{$error?.toString()}</div>
  <div data-testid="data">{JSON.stringify($data)}</div>

  {#each $messages as message, i (i)}
    <div data-testid={`message-${i}`}>
      {message.role}: {message.content}
    </div>
  {/each}

  <button
    data-testid="button"
    click={$append({ role: 'user', content: 'hi' })}
  />
</div>
