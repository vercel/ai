import {
  StreamingTextResponse,
} from 'ai';
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BytesOutputParser } from "@langchain/core/output_parsers";
import { ZepClient } from '@getzep/zep-js';
import { ZepChatMessageHistory } from '@getzep/zep-js/langchain';
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ConsoleCallbackHandler } from "@langchain/core/tracers/console";
import { ChatOpenAI } from "@langchain/openai";

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();
  const zep = await ZepClient.init(process.env.ZEP_API_KEY);
  const currentMessageContent = messages[messages.length - 1].content;

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Answer the user's question below. Be polite and helpful:"],
    new MessagesPlaceholder("history"),
    ["human", "{question}"],
  ]);
  /**
   * See a full list of supported models at:
   * https://js.langchain.com/docs/modules/model_io/models/
   */
  const model = new ChatOpenAI({
    temperature: 0.8,
  });

  /**
   * Chat models stream message chunks rather than bytes, so this
   * output parser handles serialization and encoding.
   */
  const outputParser = new BytesOutputParser();

  // Create a simple chain that pipes the prompt to the model with a console callback (useful for debugging)
  const chain = prompt.pipe(model).withConfig({
    callbacks: [new ConsoleCallbackHandler()],
  });

  // Add memory to our chain by wrapping it with a RunnableWithMessageHistory (using ZepChatMessageHistory as the history provider)
  // This will add user and assistant messages to the chain as well as enrich model prompts with history and conversation facts
  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    // Create a new ZepChatMessageHistory instance for each session. Relies on the sessionId passed as a configurable to the final chain
    getMessageHistory: (sessionId: string) => new ZepChatMessageHistory({
      client: zep,
      sessionId: sessionId,
      // Recommended memory type to use, it will enrich the model prompts with conversation facts and the most recent summary
      memoryType: "perpetual",
    }),
    // The key for the input messages in the prompt, must match the human message key in the prompt
    inputMessagesKey: "question",
    // The key for the history messages in the prompt, must match the MessagesPlaceholder key in the prompt
    historyMessagesKey: "history",
  }).pipe(outputParser);

  const stream = await chainWithHistory.stream({
    question: currentMessageContent,
  }, {
    configurable: {
      sessionId: sessionId,
    }
  });

  return new StreamingTextResponse(stream);
}