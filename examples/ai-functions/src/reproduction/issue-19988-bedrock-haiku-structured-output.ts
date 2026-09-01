import { createAmazonBedrock } from '../../../../packages/amazon-bedrock/src';
import {
  generateObject,
  generateText,
  Output,
} from '../../../../packages/ai/src';
import { z } from '../../../ai-core/node_modules/zod';

const MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

async function main() {
  const requestBodies: Array<Record<string, unknown>> = [];

  const bedrock = createAmazonBedrock({
    region: 'ca-central-1',
    fetch: async (input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return fetch(input, init);
    },
  });

  const generateObjectResult = await generateObject({
    model: bedrock(MODEL_ID),
    schema: z.object({ headline: z.string() }),
    prompt: 'Give me a headline about coffee.',
    maxRetries: 0,
  });

  const outputObjectResult = await generateText({
    model: bedrock(MODEL_ID),
    experimental_output: Output.object({
      schema: z.object({ headline: z.string() }),
    }),
    prompt: 'Give me a headline about coffee.',
    maxRetries: 0,
  });

  if (requestBodies.length !== 2) {
    throw new Error(
      `Expected two Bedrock request bodies, received ${requestBodies.length}.`,
    );
  }

  for (const requestBody of requestBodies) {
    const additionalModelRequestFields =
      requestBody.additionalModelRequestFields as
        | { output_config?: { format?: unknown } }
        | undefined;

    if (additionalModelRequestFields?.output_config?.format != null) {
      throw new Error(
        'release-v5 unexpectedly sent additionalModelRequestFields.output_config.format for a reported structured-output call.',
      );
    }

    const toolConfig = requestBody.toolConfig as
      | { tools?: Array<{ toolSpec?: { name?: string } }> }
      | undefined;

    if (!toolConfig?.tools?.some(tool => tool.toolSpec?.name === 'json')) {
      throw new Error(
        'Expected release-v5 to use its JSON response tool fallback.',
      );
    }
  }

  const generateObjectHeadline = generateObjectResult.object.headline;
  const outputObjectHeadline = outputObjectResult.experimental_output.headline;

  if (
    generateObjectHeadline.length === 0 ||
    outputObjectHeadline.length === 0
  ) {
    throw new Error(
      'Expected both structured-output APIs to return headlines.',
    );
  }

  console.log(
    JSON.stringify({
      modelId: MODEL_ID,
      generateObjectHeadline,
      outputObjectHeadline,
      sentOutputConfigFormat: false,
      usedJsonResponseTool: true,
    }),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
