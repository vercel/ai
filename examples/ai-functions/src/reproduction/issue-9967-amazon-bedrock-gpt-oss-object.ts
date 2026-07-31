import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';

const expected = {
  name: 'Pizza',
  price: 12,
  size: 'Large',
};

async function main() {
  const attempts = Number(process.env.ISSUE_9967_ATTEMPTS ?? 80);
  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { object } = await generateObject({
      model: bedrock.languageModel('openai.gpt-oss-20b-1:0'),
      prompt: 'Extract product information from: Pizza, $12, Large',
      schema: z.object({
        name: z.string(),
        price: z.number(),
        size: z.string(),
      }),
    });

    if (
      object.name !== expected.name ||
      object.price !== expected.price ||
      object.size !== expected.size
    ) {
      throw new Error(
        `Issue #9967 reproduced: unexpected object on attempt ${attempt}: ${JSON.stringify(object)}`,
      );
    }

    console.log(`attempt ${attempt}/${attempts}: ${JSON.stringify(object)}`);
  }

  console.log(
    `Issue #9967 not reproduced after ${attempts} consecutive generations.`,
  );
}

main().catch(error => {
  console.error(
    NoObjectGeneratedError.isInstance(error)
      ? 'Issue #9967 reproduced: generateObject threw NoObjectGeneratedError.'
      : 'Issue #9967 blocked by an unrelated generation error.',
  );
  console.error(error);
  process.exitCode = 1;
});
