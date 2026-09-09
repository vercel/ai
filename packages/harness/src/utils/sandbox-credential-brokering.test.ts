import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCredentialRequestTransformation,
  generateSandboxCredentialPlaceholder,
  isSandboxCredentialPlaceholder,
  maskSandboxCredentials,
  warnCredentialBrokeringUnavailable,
} from './sandbox-credential-brokering';

const transformation = createCredentialRequestTransformation({
  matchUrl: 'https://api.example.com/v1',
  matchHeaders: { Authorization: 'Bearer sandbox-secret' },
  transformHeaders: { Authorization: 'Bearer real-secret' },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('warnCredentialBrokeringUnavailable', () => {
  it('does not warn when credential forwarding replaces all credentials', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnCredentialBrokeringUnavailable({
      environment: {
        API_KEY: 'real-secret',
        SECOND_API_KEY: 'second-real-secret',
      },
      forwardedEnvironment: {
        API_KEY: 'caller-managed-credential',
        SECOND_API_KEY: 'second-caller-managed-credential',
      },
      credentialEnvironmentVariables: ['API_KEY', 'SECOND_API_KEY'],
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when credential forwarding preserves a credential', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnCredentialBrokeringUnavailable({
      environment: {
        API_KEY: 'real-secret',
        SECOND_API_KEY: 'second-real-secret',
      },
      forwardedEnvironment: {
        API_KEY: 'caller-managed-credential',
        SECOND_API_KEY: 'second-real-secret',
      },
      credentialEnvironmentVariables: ['API_KEY', 'SECOND_API_KEY'],
    });

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'The sandbox implementation does not support configuring request transformations, so credential brokering does not work. Falling back to less secure credential forwarding.',
    );
  });

  it('warns when a forwarded credential contains an original credential', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnCredentialBrokeringUnavailable({
      environment: { API_KEY: 'real-secret' },
      forwardedEnvironment: { API_KEY: 'wrapped-real-secret' },
      credentialEnvironmentVariables: ['API_KEY'],
    });

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'The sandbox implementation does not support configuring request transformations, so credential brokering does not work. Falling back to less secure credential forwarding.',
    );
  });

  it('does not warn when no original credentials are present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnCredentialBrokeringUnavailable({
      environment: {},
      forwardedEnvironment: {},
      credentialEnvironmentVariables: ['API_KEY'],
    });

    expect(warn).not.toHaveBeenCalled();
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

describe('sandbox credential placeholders', () => {
  it('generates recognizable random values', () => {
    const first = generateSandboxCredentialPlaceholder();
    const second = generateSandboxCredentialPlaceholder();

    expect(first).toMatch(/^aisdkhc_[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^aisdkhc_[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(isSandboxCredentialPlaceholder(first)).toBe(true);
  });

  it('rejects values outside the complete placeholder format', () => {
    expect(isSandboxCredentialPlaceholder('real-secret')).toBe(false);
    expect(isSandboxCredentialPlaceholder('aisdkhc_')).toBe(false);
    expect(
      isSandboxCredentialPlaceholder(
        `prefix-${generateSandboxCredentialPlaceholder()}`,
      ),
    ).toBe(false);
  });
});

describe('createCredentialRequestTransformation', () => {
  it('maps an HTTPS base URL to a request transformation', () => {
    expect(transformation).toEqual({
      match: {
        host: 'api.example.com',
        path: { startsWith: '/v1' },
        headers: [
          {
            key: { exact: 'Authorization' },
            value: { exact: 'Bearer sandbox-secret' },
          },
        ],
      },
      transform: {
        headers: { Authorization: 'Bearer real-secret' },
      },
    });
  });

  it('omits a root path matcher', () => {
    expect(
      createCredentialRequestTransformation({
        matchUrl: 'https://api.example.com/',
        matchHeaders: { 'x-api-key': 'sandbox-secret' },
        transformHeaders: { 'x-api-key': 'real-secret' },
      }),
    ).toEqual({
      match: {
        host: 'api.example.com',
        headers: [
          {
            key: { exact: 'x-api-key' },
            value: { exact: 'sandbox-secret' },
          },
        ],
      },
      transform: { headers: { 'x-api-key': 'real-secret' } },
    });
  });

  it('preserves the protocol-independent host and path match', () => {
    expect(
      createCredentialRequestTransformation({
        matchUrl: 'http://api.example.com/v1',
        matchHeaders: { Authorization: 'Bearer sandbox-secret' },
        transformHeaders: { Authorization: 'Bearer real-secret' },
      }),
    ).toEqual({
      match: {
        host: 'api.example.com',
        path: { startsWith: '/v1' },
        headers: [
          {
            key: { exact: 'Authorization' },
            value: { exact: 'Bearer sandbox-secret' },
          },
        ],
      },
      transform: {
        headers: { Authorization: 'Bearer real-secret' },
      },
    });
  });

  it('does not include the base URL port in the domain matcher', () => {
    expect(
      createCredentialRequestTransformation({
        matchUrl: 'https://api.example.com:8443/v1',
        matchHeaders: { Authorization: 'Bearer sandbox-secret' },
        transformHeaders: { Authorization: 'Bearer real-secret' },
      }),
    ).toEqual({
      match: {
        host: 'api.example.com',
        path: { startsWith: '/v1' },
        headers: [
          {
            key: { exact: 'Authorization' },
            value: { exact: 'Bearer sandbox-secret' },
          },
        ],
      },
      transform: {
        headers: { Authorization: 'Bearer real-secret' },
      },
    });
  });

  it('matches explicit sandbox headers exactly', () => {
    expect(
      createCredentialRequestTransformation({
        matchUrl: 'https://api.example.com/v1',
        matchHeaders: { Authorization: 'Bearer aisdkhc_placeholder' },
        transformHeaders: { Authorization: 'Bearer real-secret' },
      }),
    ).toEqual({
      match: {
        host: 'api.example.com',
        path: { startsWith: '/v1' },
        headers: [
          {
            key: { exact: 'Authorization' },
            value: { exact: 'Bearer aisdkhc_placeholder' },
          },
        ],
      },
      transform: {
        headers: { Authorization: 'Bearer real-secret' },
      },
    });
  });
});
