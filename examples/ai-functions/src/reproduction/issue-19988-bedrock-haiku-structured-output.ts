import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject } from 'ai';
import { z } from 'zod';

const modelId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

async function main() {
  let requestBody: string | undefined;
  let responseStatus: number | undefined;

  const bedrock = createAmazonBedrock({
    region: 'ca-central-1',
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = init.body;
      }

      const response = await fetch(input, init);
      responseStatus = response.status;
      return response;
    },
  });

  try {
    const result = await generateObject({
      model: bedrock(modelId),
      schema: z.object({ headline: z.string().min(1) }),
      prompt: 'Give me a headline about coffee.',
    });

    if (result.object.headline.length === 0) {
      throw new Error('Bedrock returned an empty headline.');
    }

    console.log(
      `Structured output succeeded: ${JSON.stringify(result.object)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('output_config.format: Extra inputs are not permitted')
    ) {
      throw new Error(
        'ISSUE_19988_PRIMARY_FAILURE: Bedrock rejected Haiku 4.5 structured output because output_config.format was not permitted.',
        { cause: error },
      );
    }

    throw error;
  } finally {
    console.log(`Bedrock HTTP status: ${responseStatus}`);
    console.log(`Captured request body: ${requestBody}`);
  }
}

main();
