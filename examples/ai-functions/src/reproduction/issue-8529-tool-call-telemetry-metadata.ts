import { generateText, jsonSchema } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { MockTracer } from '../../../../packages/ai/src/test/mock-tracer';

const metadataAttribute = 'ai.telemetry.metadata.requestId';
const requestId = 'issue-8529-request';

async function main() {
  const tracer = new MockTracer();

  await generateText({
    model: new MockLanguageModelV2({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: 'issue-8529-tool-call',
            toolName: 'lookup',
            input: '{"query":"telemetry"}',
          },
        ],
        finishReason: 'stop',
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
        },
        warnings: [],
      }),
    }),
    prompt: 'Use the lookup tool.',
    tools: {
      lookup: {
        inputSchema: jsonSchema<{ query: string }>({
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
          additionalProperties: false,
        }),
        execute: async ({ query }) => `result for ${query}`,
      },
    },
    experimental_telemetry: {
      isEnabled: true,
      metadata: { requestId },
      tracer,
    },
  });

  const generateTextSpan = tracer.jsonSpans.find(
    span => span.name === 'ai.generateText',
  );
  const toolCallSpan = tracer.jsonSpans.find(
    span => span.name === 'ai.toolCall',
  );

  if (generateTextSpan == null) {
    throw new Error('Expected an ai.generateText telemetry span.');
  }

  if (generateTextSpan.attributes[metadataAttribute] !== requestId) {
    throw new Error(
      `Expected ai.generateText to contain ${metadataAttribute}=${requestId}.`,
    );
  }

  if (toolCallSpan == null) {
    throw new Error('Expected an ai.toolCall telemetry span.');
  }

  if (
    toolCallSpan.attributes['ai.toolCall.id'] !== 'issue-8529-tool-call' ||
    toolCallSpan.attributes['ai.toolCall.name'] !== 'lookup'
  ) {
    throw new Error('Expected telemetry for the executed lookup tool call.');
  }

  if (toolCallSpan.attributes[metadataAttribute] !== requestId) {
    throw new Error(
      'Issue #8529 reproduced: ai.toolCall is missing ai.telemetry.metadata.requestId',
    );
  }

  console.log('ai.toolCall retained call-level telemetry metadata.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
