import { describe, expect, it, vi } from 'vitest';
import {
  applyCredentialForwarding,
  createSandboxCredentialEnvironment,
} from './credential-forwarding';
import { isSandboxCredentialPlaceholder } from './sandbox-credential-brokering';

describe('applyCredentialForwarding', () => {
  it('preserves the environment when no callback is provided', async () => {
    const environment = {
      API_KEY: 'real-secret',
      BASE_URL: 'https://api.example.com',
    };

    await expect(
      applyCredentialForwarding({
        environment,
        credentialEnvironmentVariables: ['API_KEY'],
        credentialForwarding: undefined,
      }),
    ).resolves.toEqual(environment);
    expect(environment).toEqual({
      API_KEY: 'real-secret',
      BASE_URL: 'https://api.example.com',
    });
  });

  it('forwards each present credential separately', async () => {
    const credentialForwarding = vi.fn(
      async ({
        environmentVariableName,
      }: {
        environmentVariableName: string;
      }) => `ephemeral-${environmentVariableName}`,
    );

    await expect(
      applyCredentialForwarding({
        environment: {
          API_KEY: 'real-secret',
          SECOND_API_KEY: 'SECOND_API_KEY',
          BASE_URL: 'https://api.example.com',
        },
        credentialEnvironmentVariables: [
          'API_KEY',
          'SECOND_API_KEY',
          'API_KEY',
          'MISSING_API_KEY',
        ],
        credentialForwarding,
      }),
    ).resolves.toEqual({
      API_KEY: 'ephemeral-API_KEY',
      SECOND_API_KEY: 'ephemeral-SECOND_API_KEY',
      BASE_URL: 'https://api.example.com',
    });
    expect(credentialForwarding).toHaveBeenNthCalledWith(1, {
      credential: 'real-secret',
      environmentVariableName: 'API_KEY',
    });
    expect(credentialForwarding).toHaveBeenNthCalledWith(2, {
      credential: 'SECOND_API_KEY',
      environmentVariableName: 'SECOND_API_KEY',
    });
    expect(credentialForwarding).toHaveBeenCalledTimes(2);
  });

  it('supports synchronous callbacks', async () => {
    await expect(
      applyCredentialForwarding({
        environment: { API_KEY: 'real-secret' },
        credentialEnvironmentVariables: ['API_KEY'],
        credentialForwarding: ({ credential }) => `wrapped-${credential}`,
      }),
    ).resolves.toEqual({ API_KEY: 'wrapped-real-secret' });
  });

  it('propagates callback errors without using the original credential', async () => {
    await expect(
      applyCredentialForwarding({
        environment: { API_KEY: 'real-secret' },
        credentialEnvironmentVariables: ['API_KEY'],
        credentialForwarding: async () => {
          throw new Error('credential forwarding failed');
        },
      }),
    ).rejects.toThrow('credential forwarding failed');
  });
});

describe('createSandboxCredentialEnvironment', () => {
  it('forwards generated placeholders and returns the exact results', async () => {
    const credentialForwarding = vi.fn(
      ({ credential }: { credential: string }) => `wrapped-${credential}`,
    );

    const result = await createSandboxCredentialEnvironment({
      environment: {
        API_KEY: 'real-secret',
        SECOND_API_KEY: 'second-real-secret',
        BASE_URL: 'https://api.example.com',
      },
      credentialEnvironmentVariables: ['API_KEY', 'SECOND_API_KEY'],
      credentialForwarding,
    });

    expect(credentialForwarding).toHaveBeenCalledTimes(2);
    for (const call of credentialForwarding.mock.calls) {
      expect(isSandboxCredentialPlaceholder(call[0].credential)).toBe(true);
    }
    expect(result.API_KEY).toMatch(/^wrapped-aisdkhc_/);
    expect(result.SECOND_API_KEY).toMatch(/^wrapped-aisdkhc_/);
  });

  it('does not add absent credential variables', async () => {
    await expect(
      createSandboxCredentialEnvironment({
        environment: { BASE_URL: 'https://api.example.com' },
        credentialEnvironmentVariables: ['API_KEY'],
        credentialForwarding: undefined,
      }),
    ).resolves.toEqual({});
  });
});
