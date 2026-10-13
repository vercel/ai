import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { InvalidArgumentError } from 'ai';
import assert from 'node:assert/strict';

const invalidHostnameParts = [
  'evil.example.com/#',
  'user@internal:8080/#',
  '169.254.169.254:80/x#',
  'us-east-1/../..',
  'us east 1',
  '',
] as const;

const endpointEnvironmentVariables = [
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
] as const;

function isInvalidArgument(error: unknown, argument: string): boolean {
  return (
    InvalidArgumentError.isInstance(error) &&
    (error as unknown as { argument?: unknown }).argument === argument
  );
}

async function captureBedrockUrl({
  region,
  baseURL,
}: {
  region: string;
  baseURL?: string;
}): Promise<string> {
  let capturedUrl: string | undefined;

  const model = createAmazonBedrock({
    region,
    baseURL,
    apiKey: 'test-key',
    fetch: async url => {
      capturedUrl = String(url);
      throw new Error('captured Bedrock request');
    },
  })('test-model');

  await assert.rejects(
    Promise.resolve(model.doGenerate({ prompt: [] })),
    /captured Bedrock request/,
  );
  assert.ok(capturedUrl, 'Bedrock did not call the capture fetch');
  return capturedUrl;
}

async function captureVertexUrl({
  location,
  baseURL,
}: {
  location: string;
  baseURL: string;
}): Promise<string> {
  let capturedUrl: string | undefined;

  const model = createGoogleVertex({
    project: 'test-project',
    location,
    baseURL,
    apiKey: 'test-key',
    fetch: async url => {
      capturedUrl = String(url);
      throw new Error('captured Vertex request');
    },
  })('test-model');

  await assert.rejects(
    Promise.resolve(model.doGenerate({ prompt: [] })),
    /captured Vertex request/,
  );
  assert.ok(capturedUrl, 'Vertex did not call the capture fetch');
  return capturedUrl;
}

function getVertexBaseURL(location: string): string {
  const model = createGoogleVertex({
    project: 'test-project',
    location,
  })('test-model') as unknown as { config: { baseURL: string } };

  return model.config.baseURL;
}

async function assertBedrockRejectsInvalidRegions() {
  for (const region of invalidHostnameParts) {
    let fetchCalled = false;
    const model = createAmazonBedrock({
      region,
      apiKey: 'test-key',
      fetch: async () => {
        fetchCalled = true;
        throw new Error('invalid Bedrock region reached fetch');
      },
    })('test-model');

    await assert.rejects(
      Promise.resolve(model.doGenerate({ prompt: [] })),
      (error: unknown) => isInvalidArgument(error, 'region') && !fetchCalled,
      `Bedrock should reject region ${JSON.stringify(region)} before fetching`,
    );
  }
}

function assertVertexRejectsInvalidLocations() {
  for (const location of invalidHostnameParts) {
    let fetchCalled = false;

    assert.throws(
      () =>
        createGoogleVertex({
          project: 'test-project',
          location,
          fetch: async () => {
            fetchCalled = true;
            throw new Error('invalid Vertex location reached fetch');
          },
        })('test-model'),
      (error: unknown) => isInvalidArgument(error, 'location') && !fetchCalled,
      `Vertex should reject location ${JSON.stringify(location)} before fetching`,
    );
  }
}

async function assertValidGeneratedEndpoints() {
  const bedrockEndpoints = {
    'us-east-1': 'https://bedrock-runtime.us-east-1.amazonaws.com/',
    'cn-north-1': 'https://bedrock-runtime.cn-north-1.amazonaws.com.cn/',
    'us-iso-east-1': 'https://bedrock-runtime.us-iso-east-1.c2s.ic.gov/',
    'eusc-de-east-1': 'https://bedrock-runtime.eusc-de-east-1.amazonaws.eu/',
  } as const;

  for (const [region, endpoint] of Object.entries(bedrockEndpoints)) {
    assert.ok(
      (await captureBedrockUrl({ region })).startsWith(endpoint),
      `Bedrock region ${region} should use ${endpoint}`,
    );
  }

  const vertexEndpoints = {
    global: 'https://aiplatform.googleapis.com/',
    eu: 'https://aiplatform.eu.rep.googleapis.com/',
    us: 'https://aiplatform.us.rep.googleapis.com/',
    'us-central1': 'https://us-central1-aiplatform.googleapis.com/',
  } as const;

  for (const [location, endpoint] of Object.entries(vertexEndpoints)) {
    assert.ok(
      getVertexBaseURL(location).startsWith(endpoint),
      `Vertex location ${location} should use ${endpoint}`,
    );
  }
}

async function assertCustomEndpointsRemainSupported() {
  assert.ok(
    (
      await captureBedrockUrl({
        region: 'user@internal:8080/#',
        baseURL: 'https://bedrock-proxy.example/v1',
      })
    ).startsWith('https://bedrock-proxy.example/v1/'),
  );

  process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME =
    'https://bedrock-env-proxy.example/v1';
  assert.ok(
    (
      await captureBedrockUrl({
        region: '169.254.169.254:80/x#',
      })
    ).startsWith('https://bedrock-env-proxy.example/v1/'),
  );
  delete process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME;

  assert.ok(
    (
      await captureVertexUrl({
        location: 'user@internal:8080/#',
        baseURL: 'https://vertex-proxy.example/v1',
      })
    ).startsWith('https://vertex-proxy.example/v1/'),
  );
}

async function main() {
  const originalEnvironment = Object.fromEntries(
    endpointEnvironmentVariables.map(name => [name, process.env[name]]),
  );

  for (const name of endpointEnvironmentVariables) {
    delete process.env[name];
  }

  try {
    await assertBedrockRejectsInvalidRegions();
    assertVertexRejectsInvalidLocations();
    await assertValidGeneratedEndpoints();
    await assertCustomEndpointsRemainSupported();
  } finally {
    for (const name of endpointEnvironmentVariables) {
      const originalValue = originalEnvironment[name];
      if (originalValue == null) {
        delete process.env[name];
      } else {
        process.env[name] = originalValue;
      }
    }
  }

  console.log(
    'Issue #21823 could not be reproduced: invalid region/location values were rejected before fetch, while valid and custom endpoints remained usable.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
