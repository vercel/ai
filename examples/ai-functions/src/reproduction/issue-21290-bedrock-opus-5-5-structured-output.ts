import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText, Output } from 'ai';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: amazonBedrock('us.anthropic.claude-opus-5-5'),
    output: Output.object({
      schema: z.object({
        answer: z.string(),
      }),
    }),
    prompt: 'Return an answer of OK.',
    maxOutputTokens: 64,
  });

  if (result.output.answer !== 'OK') {
    throw new Error(
      `Expected the structured answer to be "OK", received ${JSON.stringify(result.output)}`,
    );
  }
}

main().catch(error => {
  const forcedToolError =
    'tool_choice: type "tool" and "any" are not supported for this model.';

  if (
    APICallError.isInstance(error) &&
    error.message.includes(forcedToolError)
  ) {
    console.error(
      `ISSUE_21290: Bedrock Claude Opus 5.5 structured output failed because AI SDK forced unsupported tool use: ${forcedToolError}`,
    );
    process.exitCode = 1;
    return;
  }

  throw error;
});
