import { strict as assert } from 'node:assert';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  let requestBody: unknown;
  let responseStatus: number | undefined;

  const bedrock = createAmazonBedrock({
    region: 'ca-central-1',
    fetch: async (input, init) => {
      requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      const response = await fetch(input, init);
      responseStatus = response.status;
      return response;
    },
  });

  const result = await generateObject({
    model: bedrock('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    schema: z.object({ headline: z.string() }),
    prompt: 'Give me a headline about coffee.',
  });

  assert.equal(
    (
      requestBody as {
        additionalModelRequestFields?: {
          output_config?: { format?: { type?: string } };
        };
      }
    ).additionalModelRequestFields?.output_config?.format?.type,
    'json_schema',
    'AI SDK did not send the reported output_config.format request field',
  );
  assert.equal(responseStatus, 200, 'Bedrock did not accept the request');
  assert.equal(
    typeof result.object.headline,
    'string',
    'generateObject did not return the requested structured object',
  );
  assert.ok(
    result.object.headline.length > 0,
    'generateObject returned an empty headline',
  );

  console.log(
    'Structured output succeeded with output_config.format on Claude Haiku 4.5.',
  );
  console.log(`Headline: ${result.object.headline}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
