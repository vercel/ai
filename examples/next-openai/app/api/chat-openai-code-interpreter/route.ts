import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  InferUITool,
  streamText,
  UIDataTypes,
  UIMessage,
} from 'ai';

export const maxDuration = 30;

export type OpenAIFileSearchMessage = UIMessage<
  never,
  UIDataTypes,
  {
    file_search: InferUITool<ReturnType<typeof openai.tools.fileSearch>>;
  }
>;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const fileID = 'file-...';

  const result = streamText({
    model: openai.responses('gpt-4o'),
    headers: {
      'OpenAI-Beta': 'responses=v1',
    },
    tools: {
      code_interpreter: {
        ...openai.tools.codeInterpreter(),
        name: 'code_interpreter',
      },
    },
    providerOptions: {
      openai: {
        toolResources: {
          code_interpreter: { file_ids: [fileID] },
        },
      },
    },
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
