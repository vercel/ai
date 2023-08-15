---
title: LangChain
---

# LangChain

[LangChain](https://js.langchain.com/docs/) is a framework for developing applications powered by language models.
It provides tools and abstractions for working with AI models, agents, vector stores, and other data sources for retrieval augmented generation (RAG).
However, LangChain does not provide a way to easily build UIs or a standard way to stream data to the client.

## Example

Here is an example implementation of a chat application that uses both Vercel AI SDK and a composed LangChain chain together with the
[Next.js](https://nextjs.org/docs) App Router. It includes a LangChain [`PromptTemplate`](https://js.langchain.com/docs/modules/model_io/prompts/prompt_templates/)
to pass input into a [`ChatOpenAI`](https://js.langchain.com/docs/modules/model_io/models/chat/integrations/openai) model wrapper,
then streams the result through an encoding output parser.

It takes this stream and uses Vercel AI SDK's [`StreamingTextResponse`](/docs/api-reference/streaming-text-response)
to pipe text to the client (from the edge) and then Vercel AI SDK's `useChat` to handle the chat UI.

```tsx filename="app/api/chat/route.ts"
import { NextRequest } from 'next/server'
import { Message as VercelChatMessage, StreamingTextResponse } from 'ai'

import { ChatOpenAI } from 'langchain/chat_models/openai'
import { BytesOutputParser } from 'langchain/schema/output_parser'
import { PromptTemplate } from 'langchain/prompts'

export const runtime = 'edge'

/**
 * Basic memory formatter that stringifies and passes
 * message history directly into the model.
 */
const formatMessage = (message: VercelChatMessage) => {
  return `${message.role}: ${message.content}`
}

const TEMPLATE = `You are a pirate named Patchy. All responses must be extremely verbose and in pirate dialect.

Current conversation:
{chat_history}

User: {input}
AI:`

/*
 * This handler initializes and calls a simple chain with a prompt,
 * chat model, and output parser. See the docs for more information:
 *
 * https://js.langchain.com/docs/guides/expression_language/cookbook#prompttemplate--llm--outputparser
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const messages = body.messages ?? []
  const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage)
  const currentMessageContent = messages[messages.length - 1].content

  const prompt = PromptTemplate.fromTemplate(TEMPLATE)
  /**
   * See a full list of supported models at:
   * https://js.langchain.com/docs/modules/model_io/models/
   */
  const model = new ChatOpenAI({
    temperature: 0.8
  })

  /**
   * Chat models stream message chunks rather than bytes, so this
   * output parser handles serialization and encoding.
   */
  const outputParser = new BytesOutputParser()

  /*
   * Can also initialize as:
   *
   * import { RunnableSequence } from "langchain/schema/runnable";
   * const chain = RunnableSequence.from([prompt, model, outputParser]);
   */
  const chain = prompt.pipe(model).pipe(outputParser)

  const stream = await chain.stream({
    chat_history: formattedPreviousMessages.join('\n'),
    input: currentMessageContent
  })

  return new StreamingTextResponse(stream)
}
```

Then, we use the Vercel AI SDK's [`useChat`](/docs/api-reference/use-chat) method:

```tsx filename="app/page.tsx"
'use client'

import { useChat } from 'ai/react'

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()

  return (
    <div className="mx-auto w-full max-w-md py-24 flex flex-col stretch">
      {messages.map(m => (
        <div key={m.id}>
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <label>
          Say something...
          <input
            className="fixed w-full max-w-md bottom-0 border border-gray-300 rounded mb-8 shadow-xl p-2"
            value={input}
            onChange={handleInputChange}
          />
        </label>
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

For more usage examples, including agents and retrieval, you can check out the [official LangChain starter template](https://github.com/langchain-ai/langchain-nextjs-template).

# Advanced

For streaming with legacy or more complex chains or agents that don't support streaming out of the box, you can use the `LangChainStream` class to handle certain
[callbacks](https://js.langchain.com/docs/api/callbacks/) provided by LangChain on your behalf.
Under the hood it is a wrapper over LangChain's [`callbacks`](https://js.langchain.com/docs/production/callbacks/).
We wrap over these methods to provide which then write to the `stream` which can then be passed directly to [`StreamingTextResponse`](/docs/api-reference/streaming-text-response).

You can see an example of how this looks from the [`LangChainStream` docs page](/docs/api-reference/langchain-stream).
