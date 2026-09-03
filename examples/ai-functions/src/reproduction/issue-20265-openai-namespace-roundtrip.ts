import { createOpenAI } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  generateText,
  readUIMessageStream,
  streamText,
  tool,
} from 'ai';
import { z } from 'zod';

const namespace = 'widget_tools';
const toolName = 'create_widget';
const failureSignal =
  'ISSUE_20265_REPRODUCED: replayed namespaced tool call was rejected because its namespace was missing';

async function main() {
  const requestBodies: Array<Record<string, unknown>> = [];

  const openai = createOpenAI({
    fetch: async (url, init) => {
      const requestBody = JSON.parse(String(init?.body)) as Record<
        string,
        unknown
      >;
      requestBodies.push(requestBody);

      const response = await globalThis.fetch(url, init);
      return response;
    },
  });

  const namespacedTool = tool({
    description: 'Create a synthetic widget.',
    inputSchema: z.object({
      widgetData: z.object({}),
      widgetType: z.string(),
    }),
    strict: false,
    execute: async () => ({ created: true }),
    providerOptions: {
      openai: {
        deferLoading: true,
        namespace: {
          description: 'Synthetic widget tools.',
          name: namespace,
        },
      },
    },
  });

  const tools = {
    [toolName]: namespacedTool,
    tool_search: openai.tools.toolSearch(),
  };

  const sharedOptions = {
    model: openai.responses(process.env.OPENAI_MODEL ?? 'gpt-5.4'),
    tools,
    providerOptions: { openai: { store: false } },
    maxRetries: 0,
  } as const;

  const firstUserMessage = {
    role: 'user' as const,
    content:
      'Use tool search to load create_widget, then call it with exactly {}. Do not provide its required fields; this is an input-validation test.',
  };

  const firstResult = streamText({
    ...sharedOptions,
    messages: [firstUserMessage],
    toolChoice: 'required',
  });

  let uiMessage;
  for await (const snapshot of readUIMessageStream({
    stream: firstResult.toUIMessageStream(),
  })) {
    uiMessage = snapshot;
  }

  if (uiMessage == null) {
    throw new Error('The first OpenAI response produced no UI message.');
  }

  const toolPart = uiMessage.parts.find(
    part =>
      part.type === `tool-${toolName}` ||
      ('toolName' in part && part.toolName === toolName),
  );

  if (toolPart == null || !('state' in toolPart)) {
    throw new Error(`OpenAI did not issue the expected ${toolName} call.`);
  }

  if (toolPart.state !== 'output-error') {
    throw new Error(
      `Expected ${toolName} to fail input validation, received state ${toolPart.state}.`,
    );
  }

  const replayedMessages = await convertToModelMessages([uiMessage]);
  const history = [
    firstUserMessage,
    ...replayedMessages,
    { role: 'user' as const, content: 'Now answer continued.' },
  ];

  try {
    await generateText({
      ...sharedOptions,
      messages: history,
      toolChoice: 'auto',
    });
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error != null && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const message = error instanceof Error ? error.message : String(error);

    if (
      statusCode === 400 &&
      message.includes('Missing namespace for function_call')
    ) {
      const secondRequestBody = requestBodies[1] as
        | { input?: Array<Record<string, unknown>> }
        | undefined;
      const replayedFunctionCall = secondRequestBody?.input?.find(
        item => item.type === 'function_call' && item.name === toolName,
      );

      if (replayedFunctionCall?.namespace == null) {
        console.error(failureSignal);
        process.exitCode = 1;
        return;
      }
    }

    throw error;
  }

  const secondRequestBody = requestBodies[1] as
    | { input?: Array<Record<string, unknown>> }
    | undefined;
  const replayedFunctionCall = secondRequestBody?.input?.find(
    item => item.type === 'function_call' && item.name === toolName,
  );

  if (replayedFunctionCall?.namespace !== namespace) {
    throw new Error(
      `Expected replayed function call namespace ${namespace}, received ${String(
        replayedFunctionCall?.namespace,
      )}.`,
    );
  }

  console.log(
    'Namespaced invalid tool call was replayed successfully with its namespace.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
