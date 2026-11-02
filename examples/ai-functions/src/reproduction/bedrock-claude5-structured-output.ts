import { createAmazonBedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import type { JSONSchema7 } from '@ai-sdk/provider';
import { run } from '../lib/run';

// Exercises #23607 together with #24275 without live Bedrock credentials.
run(async () => {
  const provider = createAmazonBedrockAnthropic({
    region: 'us-east-1',
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      console.log('InvokeModel request:', init?.body);
      return Response.json({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'anthropic.claude-sonnet-5-5',
        content: [{ type: 'text', text: '{"answer":"42"}' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      });
    },
  });

  const schemas: JSONSchema7[] = [
    {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    },
    { type: 'object', additionalProperties: true },
  ];

  for (const schema of schemas) {
    // The closed schema uses native output_config.format; the open object
    // keeps the JSON tool so its arbitrary properties are not discarded.
    await provider('anthropic.claude-sonnet-5-5').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      responseFormat: { type: 'json', schema },
    });
  }
});
