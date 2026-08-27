import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { embedMany } from 'ai';
import fs from 'node:fs';

const profileArn =
  'arn:aws:bedrock:us-east-1:474668406012:application-inference-profile/b4mn34u2uknm';
const values = ['hello', 'world'];

async function main() {
  const successfulResponse = fs.readFileSync(
    new URL(
      '../../../../packages/amazon-bedrock/src/__fixtures__/amazon-bedrock-cohere-v4-application-inference-profile.json',
      import.meta.url,
    ),
    'utf8',
  );
  const errorResponse = fs.readFileSync(
    new URL(
      '../../../../packages/amazon-bedrock/src/__fixtures__/amazon-bedrock-cohere-v4-application-inference-profile-error.json',
      import.meta.url,
    ),
    'utf8',
  );
  const requestBodies: Record<string, unknown>[] = [];

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key-id',
    secretAccessKey: 'test-secret-access-key',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as unknown as Record<
        string,
        unknown
      >;
      requestBodies.push(body);

      if (
        body.input_type === 'search_document' &&
        body.output_dimension === 256 &&
        JSON.stringify(body.texts) === JSON.stringify(values)
      ) {
        return new Response(successfulResponse, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-amzn-bedrock-input-token-count': '2',
          },
        });
      }

      for (
        let attempt = 0;
        attempt < 100 && requestBodies.length < 2;
        attempt++
      ) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      return new Response(errorResponse, {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'x-amzn-errortype': 'ValidationException',
        },
      });
    },
  });

  try {
    const result = await embedMany({
      model: bedrock.embedding(profileArn),
      values,
      providerOptions: {
        amazonBedrock: {
          inputType: 'search_document',
          outputDimension: 256,
        },
      },
    });

    if (
      result.embeddings.length !== 2 ||
      !result.embeddings.every(embedding => embedding.length === 256) ||
      requestBodies.length !== 1 ||
      JSON.stringify(requestBodies[0]?.texts) !== JSON.stringify(values) ||
      requestBodies[0]?.input_type !== 'search_document' ||
      'inputText' in requestBodies[0]
    ) {
      throw new Error(
        'Expected two Cohere vectors from one request through the application inference profile ARN.',
      );
    }
  } catch (error) {
    await new Promise(resolve => setTimeout(resolve, 0));

    if (
      requestBodies.length === 2 &&
      requestBodies.every(
        body => !('texts' in body) && !('input_type' in body),
      ) &&
      requestBodies
        .map(body => body.inputText)
        .sort()
        .join(',') === [...values].sort().join(',')
    ) {
      throw new Error(
        'Issue #19829 reproduced: opaque Cohere application inference profile ARN produced Titan request bodies in 2 requests and embedding failed instead of returning 2 vectors in 1 Cohere request.',
        { cause: error },
      );
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
