import { OAuth2Client } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider';

const requests = [
  {
    name: 'generation',
    run: (provider: ReturnType<typeof createGoogleVertex>) =>
      provider('gemini-2.5-flash').doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }),
  },
  {
    name: 'streaming',
    run: (provider: ReturnType<typeof createGoogleVertex>) =>
      provider('gemini-2.5-flash').doStream({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }),
  },
  {
    name: 'embedding',
    run: (provider: ReturnType<typeof createGoogleVertex>) =>
      provider.embeddingModel('text-embedding-004').doEmbed({
        values: ['hello'],
      }),
  },
] as const;

function createAuthClient() {
  const authClient = new OAuth2Client({ quotaProjectId: 'auth-quota-project' });
  authClient.setCredentials({
    access_token: 'mock-token',
    expiry_date: Date.now() + 3_600_000,
  });
  authClient.transporter.request = vi
    .fn()
    .mockRejectedValue(new Error('Unexpected auth request'));
  return authClient;
}

describe('Google Vertex auth client headers', () => {
  it.each(requests)(
    'forwards quota project headers for $name requests',
    async ({ run }) => {
      const fetch = vi.fn().mockRejectedValue(new Error('Request captured'));
      const provider = createGoogleVertex({
        project: 'resource-project',
        location: 'global',
        googleAuthOptions: { authClient: createAuthClient() },
        fetch,
      });

      await expect(run(provider)).rejects.toThrow('Request captured');

      const headers = new Headers(fetch.mock.calls[0][1]?.headers);
      expect(headers.get('authorization')).toBe('Bearer mock-token');
      expect(headers.get('x-goog-user-project')).toBe('auth-quota-project');
    },
  );

  it('lets explicit headers override auth client headers', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('Request captured'));
    const provider = createGoogleVertex({
      project: 'resource-project',
      location: 'global',
      googleAuthOptions: { authClient: createAuthClient() },
      headers: { 'X-Goog-User-Project': 'explicit-quota-project' },
      fetch,
    });

    await expect(
      provider('gemini-2.5-flash').doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }),
    ).rejects.toThrow('Request captured');

    const headers = new Headers(fetch.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer mock-token');
    expect(headers.get('x-goog-user-project')).toBe('explicit-quota-project');
  });
});
