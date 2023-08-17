# LangChainStream

## `LangChainStream(callbacks?: AIStreamCallbacks): { stream: ReadableStream, handlers: LangChainCallbacks }` [#langchainstream]

`LangChainStream` is a utility function designed to facilitate the integration of [LangChain](https://js.langchain.com/docs) - a framework for engineering prompts for AI language models - with UI components and data streaming to the client side. Returns a `stream` and bag of [LangChain](js.langchain.com/docs) `BaseCallbackHandlerMethodsClass` that automatically implement streaming in such a way that you can use [`useChat`](./use-chat) and [`useCompletion`](./use-completion).

## Parameters

### `callbacks?: AIStreamCallbacks`

This optional parameter can be an object containing callback functions that handle the start of the process, each new token, and the completion of the stream interaction. If not provided, no default behavior is implemented.

The `AIStreamCallbacks` object has the following properties:

- `onStart?: () => Promise<void>`: A function that is called at the start of the process.
- `onToken?: (token: string) => Promise<void>`: A function that is called for each new token. The token is passed as a parameter.
- `onCompletion?: (completion: string) => Promise<void>`: A function that is called when a completion is complete. The full completion is passed as a parameter.
- `onFinal?: (completion: string) => Promise<void>`: A function that is called when a response is complete. The full completion is passed as a parameter.

## Returns

`LangChainStream` returns an object with two properties:

- `stream: ReadableStream`: This is the readable stream that can be piped into another stream. This stream contains the results of the LangChain process.
- `handlers: LangChainCallbacks`: This object contains handlers that can be used to handle certain callbacks provided by LangChain.

The `LangChainCallbacks` object has properties which are compatible with [LangChain's `BaseCallbackHandlerMethodsClass`](https://js.langchain.com/docs)

## Example

```tsx filename="app/api/chat/route.ts"
import { StreamingTextResponse, LangChainStream } from 'ai'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { AIMessage, HumanMessage } from 'langchain/schema'

export const runtime = 'edge'

export async function POST(req: Request) {
  const { messages } = await req.json()
  const { stream, handlers } = LangChainStream()

  const llm = new ChatOpenAI({
    streaming: true
  })

  llm
    .call(
      messages.map(m =>
        m.role == 'user'
          ? new HumanMessage(m.content)
          : new AIMessage(m.content)
      ),
      {},
      [handlers]
    )
    .catch(console.error)

  return new StreamingTextResponse(stream)
}
```

In this example, `LangChainStream` is used to create a readable stream and handlers. The handlers are used to handle callbacks from the LangChain API. The stream is then used to stream the AI output to the client.
