import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCredentialRequestTransformation,
  maskSandboxCredentials,
  warnCredentialBrokeringUnavailable,
} from './sandbox-credential-brokering';

const transformation = createCredentialRequestTransformation({
  baseUrl: 'https://api.example.com/v1',
  headers: { Authorization: 'Bearer real-secret' },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('warnCredentialBrokeringUnavailable', () => {
  it('warns that credential forwarding is less secure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnCredentialBrokeringUnavailable();

    expect(warn).toHaveBeenCalledWith(
      'The sandbox implementation does not support configuring request transformations, so credential brokering does not work. Falling back to less secure credential forwarding.',
    );
  });
});

describe('maskSandboxCredentials', () => {
  it('replaces credential values with same-name placeholders', () => {
    const environment = {
      API_KEY: 'real-secret',
      SECOND_API_KEY: 'second-secret',
      BASE_URL: 'https://api.example.com/v1',
    };

    expect(
      maskSandboxCredentials({
        environment,
        credentialEnvironmentVariables: ['API_KEY', 'SECOND_API_KEY'],
      }),
    ).toEqual({
      API_KEY: 'API_KEY',
      SECOND_API_KEY: 'SECOND_API_KEY',
      BASE_URL: 'https://api.example.com/v1',
    });
    expect(environment).toEqual({
      API_KEY: 'real-secret',
      SECOND_API_KEY: 'second-secret',
      BASE_URL: 'https://api.example.com/v1',
    });
  });

  it('does not add an absent credential variable', () => {
    expect(
      maskSandboxCredentials({
        environment: { OTHER: 'value' },
        credentialEnvironmentVariables: ['API_KEY'],
      }),
    ).toEqual({ OTHER: 'value' });
  });
});

describe('createCredentialRequestTransformation', () => {
  it('maps an HTTPS base URL to a request transformation', () => {
    expect(transformation).toEqual({
      match: {
        host: 'api.example.com',
        path: { startsWith: '/v1' },
      },
      transform: {
        headers: { Authorization: 'Bearer real-secret' },
      },
    });
  });

  it('omits a root path matcher', () => {
    expect(
      createCredentialRequestTransformation({
        baseUrl: 'https://api.example.com/',
        headers: { 'x-api-key': 'real-secret' },
      }),
    ).toEqual({
      match: { host: 'api.example.com' },
      transform: { headers: { 'x-api-key': 'real-secret' } },
    });
  });

  it('preserves the protocol-independent host and path match', () => {
    expect(
      createCredentialRequestTransformation({
        baseUrl: 'http://api.example.com/v1',
        headers: { Authorization: 'Bearer real-secret' },
      }),
    ).toEqual({
      match: {
        host: 'api.example.com',
        path: { startsWith: '/v1' },
      },
      transform: {
        headers: { Authorization: 'Bearer real-secret' },
      },
    });
  });

  it('does not include the base URL port in the domain matcher', () => {
    expect(
      createCredentialRequestTransformation({
        baseUrl: 'https://api.example.com:8443/v1',
        headers: { Authorization: 'Bearer real-secret' },
      }),
    ).toEqual({
      match: {
        host: 'api.example.com',
        path: { startsWith: '/v1' },
      },
      transform: {
        headers: { Authorization: 'Bearer real-secret' },
      },
    });
  });
});
