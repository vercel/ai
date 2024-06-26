<script lang="ts">
  import { useChat } from '@ai-sdk/svelte'
  import type { FunctionCallHandler } from 'ai'
  import { nanoid } from 'ai'

  const functionCallHandler: FunctionCallHandler = async (
    chatMessages,
    functionCall,
  ) => {
    if (functionCall.name === 'eval_code_in_browser') {
      if (functionCall.arguments) {
        // Parsing here does not always work since it seems that some characters in generated code aren't escaped properly.
        const parsedFunctionCallArguments: { code: string } = JSON.parse(
          functionCall.arguments,
        );
        // WARNING: Do NOT do this in real-world applications!
        eval(parsedFunctionCallArguments.code);
        const functionResponse = {
          messages: [
            ...chatMessages,
            {
              id: nanoid(),
              name: 'eval_code_in_browser',
              role: 'function' as const,
              content: parsedFunctionCallArguments.code,
            },
          ],
        };
        return functionResponse;
      }
    }
  };

  const { messages, input, handleSubmit } = useChat({
    api: '/api/chat-with-functions',
    experimental_onFunctionCall: functionCallHandler
  })
</script>

<svelte:head>
  <title>Home</title>
  <meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
  <h1>useChat</h1>

  <p>
    This is a demo of the <code>useChat</code> hook. It uses the
    <code>experimental_onFunctionCall</code> option to handle function calls from
    the model.
  </p>
  <p>
    The available functions are: <code>get_current_weather</code>,
    <code>get_current_time</code>
    and <code>eval_code_in_browser</code>.
  </p>

  <ul>
    {#each $messages as message}
      <li>{message.role}: {message.content}</li>
    {/each}
  </ul>
  <form on:submit={handleSubmit}>
    <input bind:value={$input} />
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
