import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { embedMany } from 'ai';

type RecordedFixture = {
  request: Record<string, unknown>;
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
};

const successFixture = readFixture(
  '../../../../packages/amazon-bedrock/src/__fixtures__/amazon-bedrock-cohere-v4-application-inference-profile.json',
);
const errorFixture = readFixture(
  '../../../../packages/amazon-bedrock/src/__fixtures__/amazon-bedrock-cohere-v4-application-inference-profile-error.json',
);

function readFixture(path: string): RecordedFixture {
  return JSON.parse(
    fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
  ) as RecordedFixture;
}

async function main() {
  const profileArn =
    'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/qibm5eutlkcy';
  const requests: Record<string, unknown>[] = [];

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    fetch: async (_input, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON request body.');
      }
      const body = JSON.parse(init.body) as Record<string, unknown>;
      requests.push(body);

      const fixture =
        JSON.stringify(body) === JSON.stringify(successFixture.request)
          ? successFixture
          : errorFixture;

      await new Promise(resolve => setTimeout(resolve, 10));

      return new Response(JSON.stringify(fixture.response.body), {
        status: fixture.response.status,
        headers: fixture.response.headers,
      });
    },
  });

  try {
    const result = await embedMany({
      model: bedrock.embedding(profileArn),
      values: ['hello', 'world'],
      providerOptions: {
        bedrock: {
          embeddingFamily: 'cohere',
          inputType: 'search_document',
          outputDimension: 256,
        },
      },
    });

    assert.deepEqual(requests, [successFixture.request]);
    assert.equal(result.embeddings.length, 2);
    assert.deepEqual(
      result.embeddings.map(embedding => embedding.length),
      [256, 256],
    );
    assert.equal(result.usage.tokens, 2);
  } catch (error) {
    const sentTitanRequests =
      requests.length === 2 &&
      requests[0]?.inputText === 'hello' &&
      requests[1]?.inputText === 'world';
    const receivedRecordedProviderError =
      error instanceof Error &&
      error.message.includes(
        (
          errorFixture.response.body as {
            message: string;
          }
        ).message,
      );

    if (sentTitanRequests && receivedRecordedProviderError) {
      throw new Error(
        'ISSUE_19829_REPRODUCED: opaque Cohere application inference profile returned no embeddings because AI SDK sent two Titan requests',
      );
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
