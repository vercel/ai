import { describe, expect, it } from 'vitest';
import {
  createACPBridgeError,
  createACPInitializationDiagnostic,
} from './acp-diagnostics';

describe('ACP diagnostics', () => {
  it('retains negotiated identity, capabilities, and session ID without metadata', () => {
    expect(
      createACPInitializationDiagnostic({
        initialization: {
          protocolVersion: 1,
          agentInfo: {
            name: 'example-acp',
            title: 'Example ACP',
            version: '1.2.3',
            _meta: { secret: 'agent-secret' },
          },
          agentCapabilities: {
            loadSession: true,
            promptCapabilities: {
              image: true,
              _meta: { secret: 'capability-secret' },
            },
            _meta: { secret: 'root-secret' },
          },
          authMethods: [
            {
              id: 'api-key',
              name: 'API key',
              _meta: { secret: 'auth-secret' },
            },
          ],
        },
        sessionId: 'session-1',
      }),
    ).toMatchInlineSnapshot(`
      {
        "agent": {
          "name": "example-acp",
          "title": "Example ACP",
          "version": "1.2.3",
        },
        "authMethods": [
          {
            "id": "api-key",
            "type": "agent",
          },
        ],
        "capabilities": {
          "loadSession": true,
          "promptCapabilities": {
            "image": true,
          },
        },
        "protocolVersion": 1,
        "sessionId": "session-1",
      }
    `);
  });

  it('wraps protocol failures with stage context and retains the cause', () => {
    const cause = new Error('connection closed');
    const error = createACPBridgeError({
      stage: 'prompt update stream',
      cause,
    });

    expect(error.message).toBe('ACP prompt update stream failed.');
    expect((error as Error & { cause?: unknown }).cause).toBe(cause);
  });

  it('identifies cancellation notification failures', () => {
    const cause = new Error('notification failed');
    const error = createACPBridgeError({
      stage: 'session cancellation',
      cause,
    });

    expect(error.message).toBe('ACP session cancellation failed.');
    expect((error as Error & { cause?: unknown }).cause).toBe(cause);
  });
});
