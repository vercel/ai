import { createAmazonBedrock } from '../../../../packages/amazon-bedrock/dist/index.mjs';
import {
  APICallError,
  extractReasoningMiddleware,
  generateText,
  jsonSchema,
  tool,
  wrapLanguageModel,
} from '../../../../packages/ai/dist/index.mjs';
import { MockLanguageModelV2 } from '../../../../packages/ai/dist/test/index.mjs';

const modelId =
  process.env.ISSUE_7034_MODEL_ID ??
  'us.anthropic.claude-3-haiku-20240307-v1:0';
const toolCallId = 'tooluse_issue_7034';

async function main() {
  const resetPassword = tool({
    description: 'Reset a user password.',
    inputSchema: jsonSchema<{
      username: string;
      password: string;
    }>({
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['username', 'password'],
      additionalProperties: false,
    }),
  });

  const middlewareResult = await generateText({
    model: wrapLanguageModel({
      model: new MockLanguageModelV2({
        doGenerate: async () => ({
          content: [
            {
              type: 'text',
              text: '<reasoning>I should call reset_password.</reasoning>\n',
            },
            {
              type: 'tool-call',
              toolCallId,
              toolName: 'reset_password',
              input: JSON.stringify({ username: 'adam', password: 'blah' }),
            },
          ],
          finishReason: 'tool-calls',
          usage: {
            inputTokens: 10,
            outputTokens: 10,
            totalTokens: 20,
          },
          warnings: [],
        }),
      }),
      middleware: extractReasoningMiddleware({ tagName: 'reasoning' }),
    }),
    prompt:
      'Can you change my password? My username is "adam" and the new password is "blah".',
    tools: { reset_password: resetPassword },
  });

  const unsignedReasoning = middlewareResult.content.find(
    part => part.type === 'reasoning',
  );
  if (
    unsignedReasoning?.type !== 'reasoning' ||
    unsignedReasoning.providerMetadata != null
  ) {
    throw new Error(
      'Setup failed: extractReasoningMiddleware did not produce unsigned reasoning.',
    );
  }

  let capturedRequest: unknown;
  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? 'us-east-1',
    fetch: async (url, init) => {
      if (typeof init?.body === 'string') {
        capturedRequest = JSON.parse(init.body);
      }
      return fetch(url, init);
    },
  });

  try {
    const result = await generateText({
      model: bedrock(modelId),
      maxRetries: 0,
      messages: [
        {
          role: 'user',
          content:
            'Can you change my password? My username is "adam" and the new password is "blah".',
        },
        {
          role: 'assistant',
          content: middlewareResult.content,
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId,
              toolName: 'reset_password',
              output: {
                type: 'text',
                value:
                  '{"success":false,"message":"Password reset failed: Password must be at least 8 characters long","username":"adam","password":"blah"}',
              },
            },
          ],
        },
      ],
      tools: { reset_password: resetPassword },
    });

    console.log('ISSUE_7034_NOT_REPRODUCED');
    console.log(result.text);
  } catch (error) {
    if (APICallError.isInstance(error)) {
      const responseBody = error.responseBody ?? error.message;
      console.error(JSON.stringify(capturedRequest, null, 2));
      console.error(responseBody);

      if (
        responseBody.includes('User messages cannot contain reasoning content')
      ) {
        console.error(
          'ISSUE_7034_REPRODUCED: User messages cannot contain reasoning content',
        );
        process.exitCode = 1;
        return;
      }

      if ([401, 402, 403, 429].includes(error.statusCode ?? 0)) {
        console.error(`ISSUE_7034_BLOCKED: HTTP ${error.statusCode}`);
        process.exitCode = 2;
        return;
      }
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
