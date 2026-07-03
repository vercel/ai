import 'dotenv/config';
import { createOpenAI } from '@ai-sdk/openai';
import {
  APICallError,
  convertToModelMessages,
  generateText,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod/v4';

type WeatherUIMessage = UIMessage<
  unknown,
  unknown,
  {
    weather: {
      input: { city: string };
      output: { weather: string; temperature: string };
    };
  }
>;

async function main() {
  const duplicateToolCallId = 'call_issue_13307_duplicate';
  const duplicateOpenAIItemId = 'fc_issue_13307_duplicate';
  const approvalId = 'approval_issue_13307';
  const capturedRequestBodies: unknown[] = [];
  const openai = createOpenAI({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        try {
          capturedRequestBodies.push(JSON.parse(init.body));
        } catch {
          capturedRequestBodies.push(init.body);
        }
      }

      return fetch(input, init);
    },
  });

  // This mirrors a persisted/rehydrated HITL history where an approval-request
  // snapshot and the later tool-output snapshot both contain the same toolCallId.
  const uiMessages: WeatherUIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Use the weather tool for Tokyo, then answer briefly.',
        },
      ],
    },
    {
      id: 'assistant-pending-approval',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-weather',
          toolCallId: duplicateToolCallId,
          callProviderMetadata: {
            openai: {
              itemId: duplicateOpenAIItemId,
            },
          },
          state: 'input-available',
          input: { city: 'Tokyo' },
          approval: {
            id: approvalId,
          },
        },
      ],
    },
    {
      id: 'assistant-with-output',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-weather',
          toolCallId: duplicateToolCallId,
          callProviderMetadata: {
            openai: {
              itemId: duplicateOpenAIItemId,
            },
          },
          state: 'output-available',
          input: { city: 'Tokyo' },
          output: { weather: 'Sunny', temperature: '20C' },
          approval: {
            id: approvalId,
            approved: true,
          },
        },
      ],
    },
  ];

  const modelMessages = await convertToModelMessages(uiMessages);

  const duplicateToolCalls = modelMessages.flatMap(message =>
    message.role === 'assistant' && Array.isArray(message.content)
      ? message.content.filter(
          part =>
            part.type === 'tool-call' &&
            part.toolCallId === duplicateToolCallId,
        )
      : [],
  );

  console.log(
    `Converted model messages contain ${duplicateToolCalls.length} tool-call parts for ${duplicateToolCallId}.`,
  );
  console.log(JSON.stringify(modelMessages, null, 2));

  if (duplicateToolCalls.length < 2) {
    throw new Error('Reproduction setup did not create duplicate tool calls.');
  }

  try {
    const result = await generateText({
      model: openai.responses('gpt-4o-mini'),
      messages: modelMessages,
      tools: {
        weather: tool({
          description: 'Return the current weather for a city.',
          inputSchema: z.object({
            city: z.string(),
          }),
          needsApproval: true,
          execute: async ({ city }) => ({
            weather: 'Sunny',
            temperature: city === 'Tokyo' ? '20C' : 'unknown',
          }),
        }),
      },
      maxOutputTokens: 20,
      maxRetries: 0,
    });

    console.log('OpenAI Responses call succeeded.');
    const requestBody = capturedRequestBodies.at(-1);
    if (
      requestBody != null &&
      typeof requestBody === 'object' &&
      'input' in requestBody &&
      Array.isArray(requestBody.input)
    ) {
      const functionCallItems = requestBody.input.filter(
        item =>
          item != null &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'function_call',
      );
      const duplicateItemIds = functionCallItems.filter(
        item =>
          'id' in item &&
          item.id === duplicateOpenAIItemId,
      );

      console.log(
        `Captured OpenAI request contains ${functionCallItems.length} function_call items and ${duplicateItemIds.length} items with id ${duplicateOpenAIItemId}.`,
      );

      if (duplicateItemIds.length > 1) {
        throw new Error(
          `OpenAI request still contains duplicate function_call item ids for ${duplicateOpenAIItemId}.`,
        );
      }
    }

    console.log(JSON.stringify(result.content, null, 2));
  } catch (error) {
    if (APICallError.isInstance(error)) {
      console.error('OpenAI Responses API call failed.');
      console.error('Status code:', error.statusCode);
      console.error('Response body:', error.responseBody);
      console.error('Request body values:');
      console.error(JSON.stringify(error.requestBodyValues, null, 2));
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
