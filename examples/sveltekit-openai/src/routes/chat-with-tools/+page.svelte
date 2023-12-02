<script lang="ts">
  import { useChat } from 'ai/svelte';
  import type { ChatRequest, Tool, ToolCallHandler } from 'ai';
  import { nanoid } from 'ai';
  const toolCallHandler: ToolCallHandler = async (chatMessages, toolCalls) => {
    let handledFunction = false;
    for (const tool of toolCalls) {
      if (tool.type === 'function') {
        const result = handleFunction(tool.function);
        if (result) {
          handledFunction = true;
          chatMessages.push({
            id: nanoid(),
            tool_call_id: tool.id,
            name: tool.function.name,
            role: 'tool' as const,
            content: result,
          });
        }
      }
    }
    if(handledFunction) {
    const toolResponse: ChatRequest = {
      messages: chatMessages,
    };
    return toolResponse;
  }

    function handleFunction(functionCall: {
      name: string;
      arguments: string;
    }): string | undefined {
      if (functionCall.name === 'eval_code_in_browser') {
        if (functionCall.arguments) {
          // Parsing here does not always work since it seems that some characters in generated code aren't escaped properly.
          const parsedFunctionCallArguments: { code: string } = JSON.parse(
            functionCall.arguments,
          );
          try {
            // WARNING: Do NOT do this in real-world applications!
            eval(parsedFunctionCallArguments.code);
          } catch (e) {
            return `Error: ${e}`;
          }
          return parsedFunctionCallArguments.code;
        }
      }
    }
  };

  const { messages, input, handleSubmit } = useChat({
    api: '/api/chat-with-functions',
    experimental_onToolCall: toolCallHandler,
  });
</script>

<svelte:head>
  <title>Home</title>
  <meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
  <h1>useChat</h1>

  <p>
    This is a demo of the <code>useChat</code> hook. It uses the
    <code>experimental_onToolCall</code> option to handle using tools from the model.
  </p>
  <p>
    Currently only the <code>function</code> type of tool is supported.
  </p>
  <p>
    The available functions are: <code>get_current_weather</code>, handled
    server side and
    <code>eval_code_in_browser</code> handled client side.
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
