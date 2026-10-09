import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { type FlexibleSchema, jsonSchema, stepCountIs, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

function extractToolError(prompt: LanguageModelV4CallOptions['prompt']) {
  const toolMessage = prompt.find(message => message.role === 'tool');
  if (toolMessage == null) {
    throw new Error('The follow-up model call did not contain a tool message.');
  }

  const toolResult = toolMessage.content.find(
    part => part.type === 'tool-result',
  );
  const output = toolResult?.output;
  if (
    output == null ||
    typeof output !== 'object' ||
    !('value' in output) ||
    typeof output.value !== 'string'
  ) {
    throw new Error(
      `The tool error had an unexpected shape: ${JSON.stringify(output)}`,
    );
  }

  return output.value;
}

async function captureValidationFeedback({
  inputSchema,
  input,
}: {
  inputSchema: FlexibleSchema;
  input: string;
}) {
  let callCount = 0;
  let feedback: string | undefined;

  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      callCount += 1;

      if (callCount === 2) {
        feedback = extractToolError(prompt);
      }

      const parts: LanguageModelV4StreamPart[] =
        callCount === 1
          ? [
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'testTool',
                input,
              },
              {
                type: 'finish',
                finishReason: {
                  unified: 'tool-calls',
                  raw: 'tool_calls',
                },
                usage,
              },
            ]
          : [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'text-1' },
              {
                type: 'text-delta',
                id: 'text-1',
                delta: 'Corrected.',
              },
              { type: 'text-end', id: 'text-1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
              },
            ];

      return { stream: convertArrayToReadableStream(parts) };
    },
  });

  await new WorkflowAgent({
    model,
    tools: {
      testTool: tool({
        inputSchema,
        execute: async () => 'done',
      }),
    },
  }).stream({
    prompt: 'Call the tool.',
    stopWhen: stepCountIs(2),
  });

  if (feedback == null) {
    throw new Error('The model was not called again with validation feedback.');
  }

  return feedback;
}

function namesArrayItem(feedback: string, index: number) {
  return (
    feedback.includes(`/edits/${index}`) ||
    feedback.includes(`edits[${index}]`) ||
    feedback.includes(`edits.${index}`)
  );
}

function validationMessage(feedback: string) {
  return feedback.split('Error message: ').at(-1) ?? feedback;
}

async function main() {
  const enumToolError = await captureValidationFeedback({
    inputSchema: z.object({
      action: z.enum(['click', 'type', 'scroll']),
    }),
    input: '{"action":"press"}',
  });

  const additionalPropertiesToolError = await captureValidationFeedback({
    inputSchema: jsonSchema({
      type: 'object',
      additionalProperties: false,
      required: ['edits'],
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['oldText', 'newText'],
            properties: {
              oldText: { type: 'string' },
              newText: { type: 'string' },
            },
          },
        },
      },
    }),
    input:
      '{"edits":[{"oldText":"a","newText":"b","path":"x.ts"},{"oldText":"c","newText":"d","path":"x.ts"}]}',
  });

  const enumFeedback = validationMessage(enumToolError);
  const additionalPropertiesFeedback = validationMessage(
    additionalPropertiesToolError,
  );

  console.log(`Enum validation feedback:\n${enumFeedback}`);
  console.log(
    `Additional-properties validation feedback:\n${additionalPropertiesFeedback}`,
  );

  const missingDetails: string[] = [];
  const allowedValues = ['click', 'type', 'scroll'];

  if (!allowedValues.every(value => enumFeedback.includes(value))) {
    missingDetails.push(
      'the enum error does not name every allowed value: "click", "type", and "scroll"',
    );
  }

  if (!additionalPropertiesFeedback.includes('path')) {
    missingDetails.push(
      'the additional-properties error does not name the unexpected "path" property',
    );
  }

  if (
    !namesArrayItem(additionalPropertiesFeedback, 0) ||
    !namesArrayItem(additionalPropertiesFeedback, 1)
  ) {
    missingDetails.push(
      'the additional-properties error does not report both invalid array items',
    );
  }

  if (missingDetails.length > 0) {
    for (const detail of missingDetails) {
      console.error(`- ${detail}`);
    }
    throw new Error(
      'ISSUE #22374 REPRODUCED: WorkflowAgent validation feedback omits actionable validation details',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
