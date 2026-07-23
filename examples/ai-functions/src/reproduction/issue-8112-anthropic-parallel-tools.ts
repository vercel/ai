import { anthropic } from '@ai-sdk/anthropic';
import {
  type ToolSet,
  type UIMessage,
  convertToModelMessages,
  generateText,
  tool,
} from 'ai';
import { z } from 'zod';

const tools = {
  research_codebase: tool({
    description: 'Research a codebase question.',
    inputSchema: z.object({ question: z.string() }),
    execute: async ({ question }) => ({
      answer: `Completed research for: ${question}`,
      success: true,
    }),
  }),
  web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
} satisfies ToolSet;

async function main() {
  const customOnlyMessages = convertToModelMessages([
    {
      role: 'assistant',
      parts: [
        {
          type: 'tool-research_codebase',
          toolCallId: 'custom-call-1',
          state: 'output-available',
          input: { question: 'First question' },
          output: { answer: 'First answer', success: true },
        },
        {
          type: 'tool-research_codebase',
          toolCallId: 'custom-call-2',
          state: 'output-available',
          input: { question: 'Second question' },
          output: { answer: 'Second answer', success: true },
        },
      ],
    },
  ] satisfies Array<Omit<UIMessage, 'id'>>);

  const customCallIds = customOnlyMessages.flatMap(message =>
    typeof message.content === 'string'
      ? []
      : message.content.flatMap(part =>
          'toolCallId' in part ? [part.toolCallId] : [],
        ),
  );

  for (const toolCallId of ['custom-call-1', 'custom-call-2']) {
    if (customCallIds.filter(id => id === toolCallId).length !== 2) {
      throw new Error(
        `Expected one call and one result for ${toolCallId} after conversion.`,
      );
    }
  }

  const webSearch = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    maxOutputTokens: 256,
    prompt:
      'Use web search to find the official Vercel AI SDK homepage. Return one sentence.',
    tools: { web_search: tools.web_search },
  });

  const webSearchCall = webSearch.content.find(
    part =>
      part.type === 'tool-call' &&
      part.toolName === 'web_search' &&
      part.providerExecuted === true,
  );
  const webSearchResult = webSearch.content.find(
    part =>
      part.type === 'tool-result' &&
      part.toolName === 'web_search' &&
      part.providerExecuted === true,
  );

  if (
    webSearchCall?.type !== 'tool-call' ||
    webSearchResult?.type !== 'tool-result'
  ) {
    throw new Error('Live Anthropic response did not execute web_search.');
  }

  const uiMessages = [
    {
      role: 'user',
      parts: [{ type: 'text', text: 'Research the AI SDK.' }],
    },
    {
      role: 'assistant',
      parts: [
        {
          type: 'tool-research_codebase',
          toolCallId: 'toolu_issue8112_custom',
          state: 'output-available',
          input: { question: 'What is the AI SDK?' },
          output: {
            answer: 'The AI SDK is a TypeScript toolkit.',
            success: true,
          },
        },
        {
          type: 'tool-web_search',
          toolCallId: webSearchCall.toolCallId,
          state: 'output-available',
          input: webSearchCall.input,
          output: webSearchResult.output,
          providerExecuted: true,
        },
      ],
    },
    {
      role: 'user',
      parts: [{ type: 'text', text: 'What did both tools find?' }],
    },
  ] satisfies Array<Omit<UIMessage, 'id'>>;

  const modelMessages = convertToModelMessages(uiMessages, { tools });

  const convertedAssistant = modelMessages.find(
    message => message.role === 'assistant',
  );
  const convertedTool = modelMessages.find(message => message.role === 'tool');

  if (convertedAssistant == null || convertedTool == null) {
    throw new Error('convertToModelMessages did not preserve both tool calls.');
  }

  const correctedModelMessages = modelMessages.map(message => {
    if (message.role !== 'assistant' || typeof message.content === 'string') {
      return message;
    }

    const clientToolCalls = message.content.filter(
      part => part.type === 'tool-call' && part.providerExecuted !== true,
    );

    return {
      ...message,
      content: [
        ...message.content.filter(part => !clientToolCalls.includes(part)),
        ...clientToolCalls,
      ],
    };
  });

  await generateText({
    model: anthropic('claude-sonnet-4-6'),
    maxOutputTokens: 64,
    messages: correctedModelMessages,
    tools,
  });

  try {
    await generateText({
      model: anthropic('claude-sonnet-4-6'),
      maxOutputTokens: 64,
      messages: modelMessages,
      tools,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('tool_result` blocks immediately after')) {
      console.error(`ISSUE_8112_REPRODUCED: ${message}`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log(
    'ISSUE_8112_NOT_REPRODUCED: Anthropic accepted the converted history.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
