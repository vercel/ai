import { LangChainStream, Message, streamToResponse } from 'ai'
import { CallbackManager } from 'langchain/callbacks'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { AIChatMessage, HumanChatMessage } from 'langchain/schema'

export const runtime = 'edge'

export default defineEventHandler(async event => {
  // Extract the `prompt` from the body of the request
  const { messages } = await readBody(event)

  const { stream, handlers } = LangChainStream()

  const openaiApiKey = process.env.OPENAI_API_KEY || ''
  if (!openaiApiKey) {
    console.error('OPENAI_API_KEY is not set in the environment')
  } else {
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      streaming: true,
      callbackManager: CallbackManager.fromHandlers(handlers)
    })

    llm
      .call(
        (messages as Message[]).map(message =>
          message.role === 'user'
            ? new HumanChatMessage(message.content)
            : new AIChatMessage(message.content)
        )
      )
      .catch(console.error)

    return streamToResponse(stream, event.node.res)
  }
})
