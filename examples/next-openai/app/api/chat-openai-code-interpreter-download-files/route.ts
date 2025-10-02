import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  InferUITools,
  streamText,
  ToolSet,
  UIDataTypes,
  UIMessage,
  validateUIMessages,
} from 'ai';

const tools = {
  code_interpreter: openai.tools.codeInterpreter(),
} satisfies ToolSet;

export type OpenAICodeInterpreterMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: openai('gpt-4.1-mini'),
    system:'If you used Code Interpreter to create the file, ask at the end, "Were you able to download the file using Code Interpreter?"',
    tools: {
      code_interpreter: openai.tools.codeInterpreter(),
    },
    messages: convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse();
}
