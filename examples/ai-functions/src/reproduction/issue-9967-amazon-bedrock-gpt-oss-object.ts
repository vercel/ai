import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { generateObject, NoObjectGeneratedError } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

const modelId = 'openai.gpt-oss-20b-1:0';
const replayFixture = process.env.ISSUE_9967_REPLAY_FIXTURE === '1';
const attempts = replayFixture
  ? 1
  : Number(process.env.ISSUE_9967_ATTEMPTS ?? 20);
const fixturePath =
  '../../packages/amazon-bedrock/src/__fixtures__/' +
  'issue-9967-gpt-oss-json-tool-name-channel.json';

type Exchange = {
  requestBody: unknown;
  responseBody: unknown;
  responseStatus: number;
};

async function main() {
  const exchanges: Exchange[] = [];
  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? (replayFixture ? 'us-east-1' : undefined),
    accessKeyId:
      process.env.AWS_ACCESS_KEY_ID ?? (replayFixture ? 'test-key' : undefined),
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY ??
      (replayFixture ? 'test-secret' : undefined),
    sessionToken: process.env.AWS_SESSION_TOKEN,
    fetch: async (input, init) => {
      const response = replayFixture
        ? new Response(fs.readFileSync(fixturePath, 'utf8'), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : await fetch(input, init);
      const requestText = typeof init?.body === 'string' ? init.body : '';
      const responseText = await response.clone().text();

      exchanges.push({
        requestBody: await parseJson(requestText),
        responseBody: await parseJson(responseText),
        responseStatus: response.status,
      });

      return response;
    },
  });

  const schema = z.object({
    name: z.string(),
    price: z.number(),
    size: z.string(),
  });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { object } = await generateObject({
        model: bedrock.languageModel(modelId),
        prompt: 'Extract product information from: Pizza, $12, Large',
        schema,
      });

      if (
        object.name !== 'Pizza' ||
        object.price !== 12 ||
        object.size !== 'Large'
      ) {
        throw new Error(
          `Unexpected object on attempt ${attempt}: ${JSON.stringify(object)}`,
        );
      }

      console.log(`attempt ${attempt}/${attempts}: ${JSON.stringify(object)}`);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        console.error(
          `ISSUE_9967_REPRODUCED: NoObjectGeneratedError on attempt ${attempt}`,
        );
        console.error(
          JSON.stringify(
            {
              error: {
                finishReason: error.finishReason,
                message: error.message,
                text: error.text,
              },
              exchange: exchanges.at(-1),
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  }

  console.log(
    `ISSUE_9967_NOT_REPRODUCED: ${attempts} object generations succeeded`,
  );
}

async function parseJson(text: string): Promise<unknown> {
  if (text === '') {
    return undefined;
  }

  const result = await safeParseJSON({ text });
  return result.success ? result.value : text;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
