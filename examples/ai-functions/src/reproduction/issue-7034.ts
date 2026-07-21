import 'dotenv/config';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import {
  extractReasoningMiddleware,
  generateText,
  tool,
  wrapLanguageModel,
  type ModelMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const resetPassword = tool({
  description: 'Reset a user password.',
  inputSchema: z.object({
    username: z.string(),
    password: z.string(),
  }),
  execute: async ({ username, password }) => ({
    success: false,
    message:
      'Password reset failed: Password must be at least 8 characters long',
    username,
    password,
  }),
});

async function main() {
  const initialMessage: ModelMessage = {
    role: 'user',
    content:
      'Can you change my password? My username is "adam" and the new password I want is "blah"',
  };

  // Produce the same unsigned reasoning + tool result history that
  // extractReasoningMiddleware creates from XML-tagged model text.
  const firstTurn = await generateText({
    model: wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [
            {
              type: 'text',
              text: [
                '<think>',
                'The user requested a password reset, so I should call the reset_password tool.',
                '</think>',
              ].join(''),
            },
            {
              type: 'tool-call',
              toolCallId: 'tooluse_issue7034',
              toolName: 'reset_password',
              input: JSON.stringify({ username: 'adam', password: 'blah' }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 20,
              text: 20,
              reasoning: 15,
            },
          },
          warnings: [],
        },
      }),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    tools: { reset_password: resetPassword },
    messages: [initialMessage],
  });

  const generatedMessages = firstTurn.response.messages;
  const assistantMessage = generatedMessages.find(
    message => message.role === 'assistant',
  );
  const toolMessage = generatedMessages.find(
    message => message.role === 'tool',
  );

  if (
    assistantMessage == null ||
    typeof assistantMessage.content === 'string' ||
    !assistantMessage.content.some(part => part.type === 'reasoning')
  ) {
    throw new Error(
      'SETUP_FAILURE: extractReasoningMiddleware did not produce reasoning content',
    );
  }

  if (
    toolMessage == null ||
    !toolMessage.content.some(part => part.type === 'tool-result')
  ) {
    throw new Error('SETUP_FAILURE: the tool result message was not produced');
  }

  let requestBody: Record<string, unknown> | undefined;
  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as Record<string, unknown>;
      }
      return globalThis.fetch(input, init);
    },
  });

  const result = await generateText({
    model: bedrock('us.anthropic.claude-3-haiku-20240307-v1:0'),
    tools: { reset_password: resetPassword },
    messages: [initialMessage, ...generatedMessages],
    maxOutputTokens: 100,
  });

  const bedrockMessages = requestBody?.messages;
  if (!Array.isArray(bedrockMessages)) {
    throw new Error(
      'SETUP_FAILURE: Bedrock request messages were not captured',
    );
  }

  const requestContainsReasoning = bedrockMessages.some(
    message =>
      typeof message === 'object' &&
      message != null &&
      Array.isArray((message as { content?: unknown }).content) &&
      (message as { content: unknown[] }).content.some(
        part =>
          typeof part === 'object' &&
          part != null &&
          'reasoningContent' in part,
      ),
  );

  const requestContainsUserToolResult = bedrockMessages.some(
    message =>
      typeof message === 'object' &&
      message != null &&
      (message as { role?: unknown }).role === 'user' &&
      Array.isArray((message as { content?: unknown }).content) &&
      (message as { content: unknown[] }).content.some(
        part =>
          typeof part === 'object' && part != null && 'toolResult' in part,
      ),
  );

  if (requestContainsReasoning) {
    throw new Error(
      'ISSUE_7034_REPRODUCED: Bedrock request replayed unsigned reasoning content',
    );
  }

  if (!requestContainsUserToolResult) {
    throw new Error(
      'SETUP_FAILURE: Bedrock request did not contain the expected user-role toolResult',
    );
  }

  console.log('LIVE_BEDROCK_CALL_SUCCEEDED');
  console.log('UNSIGNED_REASONING_OMITTED');
  console.log('USER_TOOL_RESULT_PRESERVED');
  console.log(`MODEL_RESPONSE_PRESENT=${result.text.length > 0}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
