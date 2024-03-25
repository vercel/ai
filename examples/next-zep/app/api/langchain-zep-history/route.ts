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

  const chain = prompt.pipe(model).withConfig({
    callbacks: [new ConsoleCallbackHandler()],
  });

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    getMessageHistory: (sessionId: string) => new ZepChatMessageHistory({
      client: zep,
      sessionId: sessionId,
      memoryType: "perpetual",
    }),
    inputMessagesKey: "question",
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