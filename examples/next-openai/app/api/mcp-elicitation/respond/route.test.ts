import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingElicitation } from '../elicitation-store';
import { POST } from './route';

describe('elicitation response logging', () => {
  const content = {
    username: 'example-user',
    email: 'private@example.invalid',
    password: 'private-password-fixture',
    customSecret: 'private-custom-secret-fixture',
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function loggedOutput() {
    return [
      vi.mocked(console.log).mock.calls,
      vi.mocked(console.warn).mock.calls,
      vi.mocked(console.error).mock.calls,
    ]
      .flat()
      .map(args => format(...args))
      .join('\n');
  }

  function expectNoContentLogged() {
    for (const value of Object.values(content)) {
      expect(loggedOutput()).not.toContain(value);
    }
  }

  it.each(['accept', 'decline', 'cancel'] as const)(
    'resolves %s responses without logging submitted content',
    async action => {
      const id = `elicitation-${action}`;
      const pending = createPendingElicitation(id);
      const submitted = { id, action, content };

      const response = await POST(
        new Request('http://localhost/api/mcp-elicitation/respond', {
          method: 'POST',
          body: JSON.stringify(submitted),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      expect(await pending).toEqual(submitted);
      expect(globalThis.pendingElicitations?.has(id)).toBe(false);
      expect(console.log).toHaveBeenCalledWith('[respond] ID:', id);
      expect(console.log).toHaveBeenCalledWith('[respond] Action:', action);
      expectNoContentLogged();
    },
  );

  it('does not log content for an unknown elicitation', async () => {
    const response = await POST(
      new Request('http://localhost/api/mcp-elicitation/respond', {
        method: 'POST',
        body: JSON.stringify({ id: 'unknown', action: 'accept', content }),
      }),
    );

    expect(response.status).toBe(404);
    expectNoContentLogged();
  });

  it('does not log request content included in JSON parsing errors', async () => {
    const response = await POST(
      new Request('http://localhost/api/mcp-elicitation/respond', {
        method: 'POST',
        body: 'secret',
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(loggedOutput()).not.toContain('secret');
    expectNoContentLogged();
  });
});
