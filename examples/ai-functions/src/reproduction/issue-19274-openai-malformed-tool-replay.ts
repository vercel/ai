import 'dotenv/config';
import { createOpenAI } from '@ai-sdk/openai';
import { parseJSON } from '@ai-sdk/provider-utils';
import {
  APICallError,
  convertToModelMessages,
  generateText,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

type SpreadsheetUIMessage = UIMessage<
  unknown,
  Record<string, never>,
  {
    set_cell_range: {
      input: { label: string };
      output: unknown;
    };
  }
>;

type ChatCompletionRequest = {
  messages?: Array<{
    role?: string;
    tool_calls?: Array<{
      function?: {
        arguments?: string;
      };
    }>;
    content?: string;
  }>;
};

async function main() {
  let capturedRequest: ChatCompletionRequest | undefined;
  let providerStatus: number | undefined;

  const provider = createOpenAI({
    apiKey: process.env.ALIBABA_API_KEY,
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    name: 'qwen',
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        capturedRequest = (await parseJSON({
          text: init.body,
        })) as ChatCompletionRequest;
      }

      const response = await fetch(input, init);
      providerStatus = response.status;
      return response;
    },
  });

  const uiMessages: Array<Omit<SpreadsheetUIMessage, 'id'>> = [
    {
      role: 'user',
      parts: [{ type: 'text', text: 'Update the spreadsheet.' }],
    },
    {
      role: 'assistant',
      parts: [
        {
          type: 'tool-set_cell_range',
          toolCallId: 'call_1',
          state: 'output-error',
          input: undefined,
          rawInput: '{"label":"Build sheet",',
          errorText: 'Invalid input: JSON parsing failed',
        },
      ],
    },
    {
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Please retry with valid arguments.',
        },
      ],
    },
  ];

  const messages = await convertToModelMessages(uiMessages);

  try {
    await generateText({
      model: provider.chat('qwen-plus'),
      messages,
      tools: {
        set_cell_range: tool({
          description: 'Update a spreadsheet range.',
          inputSchema: z.object({
            label: z.string(),
          }),
        }),
      },
    });
  } catch (error) {
    const assistantMessage = capturedRequest?.messages?.find(
      message => message.role === 'assistant' && message.tool_calls != null,
    );
    const argumentsText =
      assistantMessage?.tool_calls?.[0]?.function?.arguments;
    const decodedArguments =
      argumentsText == null
        ? undefined
        : await parseJSON({ text: argumentsText });
    const pairedToolError = capturedRequest?.messages?.some(
      message =>
        message.role === 'tool' &&
        message.content === 'Invalid input: JSON parsing failed',
    );

    console.log(
      JSON.stringify(
        {
          providerStatus,
          emittedArguments: argumentsText,
          decodedArguments,
          decodedArgumentsType: typeof decodedArguments,
          pairedToolError,
        },
        null,
        2,
      ),
    );

    if (
      APICallError.isInstance(error) &&
      providerStatus === 400 &&
      typeof decodedArguments === 'string' &&
      pairedToolError === true
    ) {
      throw new Error(
        'Issue #19274 reproduced: strict Chat Completions continuation rejected because replayed function.arguments decoded to a string.',
      );
    }

    throw error;
  }

  const assistantMessage = capturedRequest?.messages?.find(
    message => message.role === 'assistant' && message.tool_calls != null,
  );
  const argumentsText = assistantMessage?.tool_calls?.[0]?.function?.arguments;
  const decodedArguments =
    argumentsText == null
      ? undefined
      : await parseJSON({ text: argumentsText });

  if (
    decodedArguments == null ||
    typeof decodedArguments !== 'object' ||
    Array.isArray(decodedArguments)
  ) {
    throw new Error(
      'Expected replayed function.arguments to decode to a JSON object.',
    );
  }

  console.log(
    'Continuation succeeded with object-valued replayed function arguments.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
