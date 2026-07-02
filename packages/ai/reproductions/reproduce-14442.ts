import { generateText, isStepCount } from '../src/index';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../src/test/mock-language-model-v4';
import { convertToAmazonBedrockChatMessages } from '../../amazon-bedrock/src/convert-to-amazon-bedrock-chat-messages';

async function main() {
  const malformedInput = '{ city: San Francisco, }';
  const usage = {
    inputTokens: { total: 1, noCache: 1 },
    outputTokens: { total: 1, text: 1 },
  } as any;
  let secondPrompt: any;
  let n = 0;
  const model = new MockLanguageModelV4({
    provider: 'amazon-bedrock',
    doGenerate: async ({ prompt }) => {
      n++;
      if (n === 1) {
        return {
          warnings: [],
          usage,
          finishReason: { unified: 'tool-calls', raw: undefined },
          content: [
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'weather',
              input: malformedInput,
            },
          ],
        } as any;
      }
      secondPrompt = prompt;
      return {
        warnings: [],
        usage,
        finishReason: { unified: 'stop', raw: 'stop' },
        content: [{ type: 'text', text: 'done' }],
      } as any;
    },
  });

  const result = await generateText({
    model,
    prompt: 'weather?',
    stopWhen: isStepCount(2),
    tools: {
      weather: tool({ inputSchema: z.object({ city: z.string() }) }),
    },
  });

  console.log('SDK response messages:');
  console.log(JSON.stringify(result.responseMessages, null, 2));

  const invalidToolCall = result.steps[0].content.find(
    part => part.type === 'tool-call' && part.invalid,
  ) as any;

  console.log('Invalid tool call stored in step content:');
  console.log(JSON.stringify(invalidToolCall, null, 2));

  if (
    invalidToolCall?.input?.rawInvalidInput !== malformedInput ||
    typeof invalidToolCall.input !== 'object' ||
    invalidToolCall.input === null ||
    Array.isArray(invalidToolCall.input)
  ) {
    throw new Error(
      `Reproduced issue #14442: malformed tool-call input was stored as ${JSON.stringify(
        invalidToolCall?.input,
      )}, not as { rawInvalidInput: ${JSON.stringify(malformedInput)} }.`,
    );
  }

  console.log('Second-step LanguageModelV4 prompt:');
  console.log(JSON.stringify(secondPrompt, null, 2));

  const converted = await convertToAmazonBedrockChatMessages(secondPrompt, false);
  const input = (converted.messages[1] as any).content[0].toolUse.input;
  console.log('Bedrock toolUse input:', JSON.stringify(input));
  console.log('Bedrock toolUse input type:', Object.prototype.toString.call(input));

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error(
      `Reproduced issue #14442: Bedrock toolUse.input is not a JSON object: ${JSON.stringify(input)}`,
    );
  }

  console.log('Could not reproduce issue #14442: Bedrock toolUse.input is a JSON object.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
