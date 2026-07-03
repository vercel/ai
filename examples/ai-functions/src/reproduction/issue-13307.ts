import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import {
  APICallError,
  convertToModelMessages,
  generateText,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function main() {
  assert(
    process.env.OPENAI_API_KEY,
    'OPENAI_API_KEY is required for this live OpenAI Responses API reproduction.',
  );

  const modelId = process.env.OPENAI_RESPONSES_MODEL ?? 'gpt-4.1-mini';
  const model = openai.responses(modelId);

  const tools = {
    getWeather: tool({
      description: 'Get the weather for a city.',
      inputSchema: z.object({ city: z.string() }),
      needsApproval: true,
      execute: async ({ city }) => ({ city, weather: 'sunny', temperature: 72 }),
    }),
  };

  console.log(`Using OpenAI Responses model: ${modelId}`);
  console.log('Step 1: force a live tool call that requires human approval.');

  const first = await generateText({
    model,
    prompt: 'Call the getWeather tool for Tokyo. Do not answer directly.',
    tools,
    toolChoice: { type: 'tool', toolName: 'getWeather' },
  });

  const toolCall = first.content.find(part => part.type === 'tool-call');
  const approvalRequest = first.content.find(
    part => part.type === 'tool-approval-request',
  );

  assert(toolCall, 'Expected the first live response to contain a tool call.');
  assert(
    approvalRequest,
    'Expected the first live response to contain a tool approval request.',
  );

  console.log('Observed live tool call:', {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    providerMetadata: toolCall.providerMetadata,
    approvalId: approvalRequest.approvalId,
  });

  const input = parseMaybeJson(toolCall.input) as { city?: string };
  const output = {
    city: input.city ?? 'Tokyo',
    weather: 'sunny',
    temperature: 72,
  };

  // This mirrors the reported persisted/rehydrated history shape: an earlier
  // HITL approval-request part was saved, and a later tool-output part with the
  // same toolCallId was also saved. Message ids are distinct, but the duplicated
  // identity is at the tool-part level.
  const rehydratedMessages = [
    {
      id: 'user-1',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Call the getWeather tool for Tokyo. Do not answer directly.',
        },
      ],
    },
    {
      id: 'assistant-approval-request',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-getWeather',
          state: 'approval-requested',
          toolCallId: toolCall.toolCallId,
          input,
          approval: {
            id: approvalRequest.approvalId,
          },
          callProviderMetadata: toolCall.providerMetadata,
        },
      ],
    },
    {
      id: 'assistant-tool-output',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-getWeather',
          state: 'output-available',
          toolCallId: toolCall.toolCallId,
          input,
          output,
          approval: {
            id: approvalRequest.approvalId,
            approved: true,
          },
          callProviderMetadata: toolCall.providerMetadata,
        },
      ],
    },
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: 'Now answer using the tool result.' }],
    },
  ] satisfies UIMessage[];

  const modelMessages = await convertToModelMessages(rehydratedMessages, {
    tools,
  });

  console.log('Step 2: send the rehydrated history into a follow-up response.');
  console.log(
    'Converted model-message part types:',
    modelMessages.map(message => ({
      role: message.role,
      content:
        typeof message.content === 'string'
          ? 'string'
          : message.content.map(part => part.type),
    })),
  );

  try {
    const followUp = await generateText({
      model,
      messages: modelMessages,
      tools,
    });

    console.log('Follow-up succeeded. No duplicate-item 400 was observed.');
    console.log({
      finishReason: followUp.finishReason,
      text: followUp.text,
    });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      console.error('OpenAI API call failed:', {
        statusCode: error.statusCode,
        message: error.message,
        responseBody: error.responseBody,
        requestBodyValues: error.requestBodyValues,
      });
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
