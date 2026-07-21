import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const bedrock = createAmazonBedrock({ region: 'us-east-1' });

  try {
    const result = await generateText({
      model: bedrock('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
      output: Output.object({
        schema: z.object({
          labels: z
            .array(
              z.object({
                label: z.string(),
                explanation: z.string(),
              }),
            )
            .max(3),
        }),
      }),
      prompt: 'Generate two concise labels for a customer support request.',
    });

    console.log(JSON.stringify(result.output));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes(
        "output_config.format.schema: For 'array' type, property 'maxItems' is not supported",
      )
    ) {
      console.error(
        'ISSUE_17197_REPRODUCED: Bedrock rejected Output.object() because maxItems is unsupported',
      );
    }

    throw error;
  }
}

main();
