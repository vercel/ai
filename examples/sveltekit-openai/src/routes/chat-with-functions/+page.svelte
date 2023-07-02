<script lang="ts">
  import { useChat } from 'ai/svelte'
  import type { ChatRequest, FunctionCallHandler } from 'ai'
  import { nanoid } from 'ai'

  const functionCallHandler: FunctionCallHandler = async (
    chatMessages,
    functionCall
  ) => {
    if (functionCall.name === 'get_current_weather') {
      if (functionCall.arguments) {
        const parsedFunctionCallArguments = JSON.parse(functionCall.arguments)
        // You now have access to the parsed arguments here (assuming the JSON was valid)
        // If JSON is invalid, return an appropriate message to the model so that it may retry?
        console.log(parsedFunctionCallArguments)
      }

      // Generate a fake temperature
      const temperature = Math.floor(Math.random() * (100 - 30 + 1) + 30)
      // Generate random weather condition
      const weather = ['sunny', 'cloudy', 'rainy', 'snowy'][
        Math.floor(Math.random() * 4)
      ]

      const functionResponse: ChatRequest = {
        messages: [
          ...chatMessages,
          {
            id: nanoid(),
            name: 'get_current_weather',
            role: 'function' as const,
            content: JSON.stringify({
              temperature,
              weather,
              info: 'This data is randomly generated and came from a fake weather API!'
            })
          }
        ]
      }
      return functionResponse
    } else if (functionCall.name === 'get_current_time') {
      const time = new Date().toLocaleTimeString()
      const functionResponse: ChatRequest = {
        messages: [
          ...chatMessages,
          {
            id: nanoid(),
            name: 'get_current_time',
            role: 'function' as const,
            content: JSON.stringify({ time })
          }
        ]
        // You can also (optionally) return a list of functions here that the model can call next
        // functions
      }

      return functionResponse
    } else if (functionCall.name === 'eval_code_in_browser') {
      if (functionCall.arguments) {
        // Parsing here does not always work since it seems that some characters in generated code aren't escaped properly.
        const parsedFunctionCallArguments: { code: string } = JSON.parse(
          functionCall.arguments
        )
        const functionResponse = {
          messages: [
            ...chatMessages,
            {
              id: nanoid(),
              name: 'eval_code_in_browser',
              role: 'function' as const,
              content: JSON.stringify(eval(parsedFunctionCallArguments.code))
            }
          ]
        }
        return functionResponse
      }
    }
  }

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
