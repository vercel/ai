import { describe, expect, it, vi } from 'vitest';
import { MCPAppBridge } from './bridge';

function createTargetWindow() {
  return {
    postMessage: vi.fn(),
  } as unknown as Window & { postMessage: ReturnType<typeof vi.fn> };
}

function messageEvent(targetWindow: Window, data: unknown): MessageEvent {
  return { source: targetWindow, data } as MessageEvent;
}

describe('MCPAppBridge', () => {
  it('responds to app initialization requests', async () => {
    const targetWindow = createTargetWindow();
    const bridge = new MCPAppBridge({
      targetWindow,
      hostInfo: { name: 'test-host', version: '1.0.0' },
      hostContext: { displayMode: 'inline' },
    });

    bridge.handleMessage(
      messageEvent(targetWindow, {
        jsonrpc: '2.0',
        id: 1,
        method: 'ui/initialize',
        params: {},
      }),
    );

    await vi.waitFor(() => {
      expect(targetWindow.postMessage).toHaveBeenCalled();
    });
    expect(targetWindow.postMessage.mock.calls[0]).toMatchInlineSnapshot(`
      [
        {
          "id": 1,
          "jsonrpc": "2.0",
          "result": {
            "hostCapabilities": {},
            "hostContext": {
              "displayMode": "inline",
            },
            "hostInfo": {
              "name": "test-host",
              "version": "1.0.0",
            },
            "protocolVersion": "2026-01-26",
          },
        },
        "*",
      ]
    `);
  });

  it('queues tool notifications until the app is initialized', () => {
    const targetWindow = createTargetWindow();
    const bridge = new MCPAppBridge({ targetWindow });

    bridge.sendToolInput({ topic: 'usage' });
    expect(targetWindow.postMessage).not.toHaveBeenCalled();

    bridge.handleMessage(
      messageEvent(targetWindow, {
        jsonrpc: '2.0',
        method: 'ui/notifications/initialized',
      }),
    );

    expect(targetWindow.postMessage.mock.calls).toMatchInlineSnapshot(`
      [
        [
          {
            "jsonrpc": "2.0",
            "method": "ui/notifications/tool-input",
            "params": {
              "arguments": {
                "topic": "usage",
              },
            },
          },
          "*",
        ],
      ]
    `);
  });

  it('proxies app-visible tool calls through the configured handler', async () => {
    const targetWindow = createTargetWindow();
    const bridge = new MCPAppBridge({
      targetWindow,
      handlers: {
        allowedTools: ['refreshDashboardData'],
        callTool: async params => ({
          content: [{ type: 'text', text: `called ${params.name}` }],
        }),
      },
    });

    bridge.handleMessage(
      messageEvent(targetWindow, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'refreshDashboardData',
          arguments: { reason: 'test' },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(targetWindow.postMessage).toHaveBeenCalled();
    });
    expect(targetWindow.postMessage.mock.calls[0]).toMatchInlineSnapshot(`
      [
        {
          "id": 2,
          "jsonrpc": "2.0",
          "result": {
            "content": [
              {
                "text": "called refreshDashboardData",
                "type": "text",
              },
            ],
          },
        },
        "*",
      ]
    `);
  });
});
