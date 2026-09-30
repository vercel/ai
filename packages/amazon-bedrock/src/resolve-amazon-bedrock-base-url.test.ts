import { InvalidArgumentError } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAmazonBedrockBaseURL } from './resolve-amazon-bedrock-base-url';

const ENDPOINT_ENVIRONMENT_VARIABLES = [
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
  'AWS_ENDPOINT_URL_BEDROCK_AGENT_RUNTIME',
] as const;

const ORIGINAL_ENVIRONMENT = Object.fromEntries(
  ENDPOINT_ENVIRONMENT_VARIABLES.map(name => [name, process.env[name]]),
);

function resolve({
  region = 'us-east-1',
  baseURL,
}: { region?: string; baseURL?: string } = {}) {
  return resolveAmazonBedrockBaseURL({
    baseURL,
    getRegion: () => region,
    service: 'bedrock-runtime',
    serviceEndpointUrlEnvironmentVariableName:
      'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
  });
}

function resolveError(options?: { region?: string; baseURL?: string }) {
  try {
    resolve(options);
  } catch (error) {
    return error;
  }

  return undefined;
}

beforeEach(() => {
  for (const name of ENDPOINT_ENVIRONMENT_VARIABLES) {
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of ENDPOINT_ENVIRONMENT_VARIABLES) {
    const originalValue = ORIGINAL_ENVIRONMENT[name];

    if (originalValue == null) {
      delete process.env[name];
    } else {
      process.env[name] = originalValue;
    }
  }
});

describe('resolveAmazonBedrockBaseURL', () => {
  it('generates the regional endpoint for a DNS-label region', () => {
    expect(resolve({ region: 'us-east-1' })).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com',
    );
  });

  it('uses the partition DNS suffix of the region', () => {
    expect(resolve({ region: 'cn-north-1' })).toBe(
      'https://bedrock-runtime.cn-north-1.amazonaws.com.cn',
    );
    expect(resolve({ region: 'us-iso-east-1' })).toBe(
      'https://bedrock-runtime.us-iso-east-1.c2s.ic.gov',
    );
    expect(resolve({ region: 'eusc-de-east-1' })).toBe(
      'https://bedrock-runtime.eusc-de-east-1.amazonaws.eu',
    );
  });

  it('prefers an explicit base URL over the generated endpoint', () => {
    expect(
      resolve({ region: 'us-east-1', baseURL: 'https://localhost:4566' }),
    ).toBe('https://localhost:4566');
  });

  it('prefers the service endpoint environment variable over the generated endpoint', () => {
    process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME =
      'https://runtime.example.com/';

    expect(resolve()).toBe('https://runtime.example.com');
  });

  it.each([
    'evil.example.com/#',
    'user@internal:8080/#',
    '169.254.169.254:80/x#',
    'us-east-1/../..',
    'us east 1',
    '',
  ])('rejects region %j because it would rewrite the request host', region => {
    const error = resolveError({ region });

    expect(error).toBeInstanceOf(InvalidArgumentError);
    expect(error).toMatchObject({ argument: 'region' });
  });

  it('does not reject the region when an explicit endpoint is configured', () => {
    // custom endpoints do not use the region as part of the request host
    process.env.AWS_ENDPOINT_URL = 'https://localhost:4566';

    expect(resolve({ region: 'not a region' })).toBe('https://localhost:4566');
  });
});
