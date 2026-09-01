import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const fixtureUrl = new URL(
  '../../../../packages/amazon-bedrock/src/__fixtures__/issue-9967-gpt-oss-json-tool-name-channel.json',
  import.meta.url,
);

let latestResponseBody: unknown;

async function captureFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  try {
    latestResponseBody = await response.clone().json();
  } catch {
    latestResponseBody = await response.clone().text();
  }

  return response;
}

async function replayFetch(): Promise<Response> {
  const body = await readFile(fixtureUrl, 'utf8');

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-amzn-requestid': 'issue-9967-replay',
    },
  });
}

async function generateProduct({ live }: { live: boolean }) {
  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? 'us-east-1',
    accessKeyId: live ? process.env.AWS_ACCESS_KEY_ID : 'test-access-key',
    secretAccessKey: live
      ? process.env.AWS_SECRET_ACCESS_KEY
      : 'test-secret-access-key',
    sessionToken: live ? process.env.AWS_SESSION_TOKEN : undefined,
    fetch: live ? captureFetch : replayFetch,
  });

  const { object } = await generateObject({
    model: bedrock.languageModel('openai.gpt-oss-20b-1:0'),
    prompt: 'Extract product information from: Pizza, $12, Large',
    schema: z.object({
      name: z.string(),
      price: z.number(),
      size: z.string(),
    }),
  });

  return object;
}

async function main() {
  const live = process.env.ISSUE_9967_LIVE === '1';
  const attempts = live ? Number(process.env.ISSUE_9967_ATTEMPTS ?? 60) : 1;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    latestResponseBody = undefined;

    try {
      const object = await generateProduct({ live });

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
        if (live && latestResponseBody != null) {
          console.error(
            `Bedrock response: ${JSON.stringify(latestResponseBody, null, 2)}`,
          );
        }

        console.error(
          `ISSUE_9967_REPRODUCED: NoObjectGeneratedError on attempt ${attempt}`,
        );
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  }

  console.log(
    `ISSUE_9967_NOT_REPRODUCED: ${attempts} object generation(s) succeeded`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
