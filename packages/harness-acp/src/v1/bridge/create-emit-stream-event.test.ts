import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFixtureHostToolCallResolver } from './__fixtures__/fixture-host-tool-call-resolver';
import { loadWeatherApprovalFixture } from './__fixtures__/weather-approval-fixture';
import { createEmitStreamEvent } from './create-emit-stream-event';
import { startHostToolRelay, type HostToolRelayTurn } from './host-tool-relay';
import { createHostToolRelayAuthorization } from './host-tool-relay-authorization';
import { createACPPermissionController } from './permission-controller';

describe('host weather approval stream', () => {
  afterEach(() => vi.useRealTimers());

  it.each(['cursor', 'github-copilot'])(
    'emits only the canonical relay call and result for %s',
    async harness => {
      vi.useFakeTimers();
      const fixture = loadWeatherApprovalFixture({ harness });
      const permission = fixture.find(event => event.type === 'permission');
      if (permission?.type !== 'permission')
        throw new Error('Missing captured permission.');
      const events: HarnessV1StreamPart[] = [];
      const nativeApproval = vi.fn();
      const candidate = vi.fn();
      const tools = [
        { name: 'get_weather', inputSchema: { type: 'object' as const } },
      ];
      const hostToolCallResolver = createFixtureHostToolCallResolver({
        toolNames: ['get_weather'],
      });
      const emitter = createEmitStreamEvent({
        emit: event => events.push(event),
        emitToolCallCandidate: candidate,
        builtinTools: [],
        hostToolServerName: 'ai-sdk-harness-tools',
        hostTools: tools,
        hostToolCallResolver,
      });
      const authorization = createHostToolRelayAuthorization({ ttlMs: 20 });
      const controller = createACPPermissionController({
        turn: {
          emit: (event: HarnessV1StreamPart) => events.push(event),
          requestToolApproval: nativeApproval,
          emitWarning: vi.fn(),
        } as unknown as BridgeTurn,
        sessionId: permission.value.sessionId,
        permissionMode: 'allow-edits',
        hasPermissionModeMapping: true,
        emitToolCall: emitter.permissionToolCall,
        claimHostToolPermission: emitter.claimHostToolPermission,
        onHostToolPermissionAllowed: authorization.authorizePermission,
      });
      try {
        for (const event of fixture) {
          if (event.type === 'update') {
            const update = event.value;
            const hostToolCall =
              (update.sessionUpdate === 'tool_call' ||
                update.sessionUpdate === 'tool_call_update') &&
              !emitter.isToolCallReleased({ toolCallId: update.toolCallId })
                ? hostToolCallResolver.resolveUpdateNow({ update })
                : undefined;
            authorization.observeUpdate({ update, hostToolCall });
            emitter.message({
              message: {
                kind: 'session_update',
                notification: {
                  sessionId: permission.value.sessionId,
                  update,
                },
                update,
              },
              hostToolCall,
            });
          } else {
            await vi.advanceTimersByTimeAsync(2000);
            expect(await controller.requestPermission(event.value)).toEqual({
              outcome: {
                outcome: 'selected',
                optionId: event.value.options.find(
                  option => option.kind === 'allow_once',
                )!.optionId,
              },
            });
          }
        }
        expect(nativeApproval).not.toHaveBeenCalled();
        expect(candidate).not.toHaveBeenCalled();
        expect(
          events.filter(event => event.type !== 'raw'),
        ).toMatchInlineSnapshot(`[]`);
        expect(
          events
            .filter(event => event.type === 'raw')
            .map(event => event.rawValue),
        ).toEqual(
          fixture
            .filter(event => event.type === 'update')
            .map(event => event.value),
        );
        vi.useRealTimers();
        const relay = await startHostToolRelay({
          serverName: 'ai-sdk-harness-tools',
          tools,
        });
        let resolveResult!: (value: {
          output: { city: string; temperature: number };
        }) => void;
        const result = new Promise<{
          output: { city: string; temperature: number };
        }>(resolve => {
          resolveResult = resolve;
        });
        let notifyCall!: () => void;
        const called = new Promise<void>(resolve => {
          notifyCall = resolve;
        });
        const turn: HostToolRelayTurn = {
          waitForToolCallAuthorization:
            authorization.waitForToolCallAuthorization,
          emitToolCall: options => {
            emitter.hostToolCall(options);
            notifyCall();
          },
          emitToolResult: emitter.hostToolResult,
          requestToolResult: () => result,
          registerCorrelationInvocation:
            emitter.registerHostToolCorrelationInvocation,
          emitWarning: vi.fn(),
          removeCorrelationInvocation:
            emitter.removeHostToolCorrelationInvocation,
        };
        relay.bindTurn({ turn });
        const invoke = () =>
          fetch(relay.url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${relay.credential}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              requestId: 'relay-weather',
              toolName: 'get_weather',
              input: { city: 'Austin' },
              catalogRevision: 1,
            }),
          });
        try {
          const response = invoke();
          await called;
          expect(events.filter(event => event.type !== 'raw'))
            .toMatchInlineSnapshot(`
              [
                {
                  "input": "{"city":"Austin"}",
                  "providerExecuted": false,
                  "toolCallId": "relay-weather",
                  "toolName": "get_weather",
                  "type": "tool-call",
                },
                {
                  "finishReason": {
                    "raw": "host-input",
                    "unified": "tool-calls",
                  },
                  "harnessMetadata": {
                    "acp": {
                      "inferredStep": true,
                    },
                  },
                  "type": "finish-step",
                  "usage": {
                    "inputTokens": {
                      "cacheRead": undefined,
                      "cacheWrite": undefined,
                      "noCache": undefined,
                      "total": undefined,
                    },
                    "outputTokens": {
                      "reasoning": undefined,
                      "text": undefined,
                      "total": undefined,
                    },
                  },
                },
              ]
            `);
          resolveResult({ output: { city: 'Austin', temperature: 72 } });
          expect((await response).status).toBe(200);
          expect((await invoke()).status).toBe(401);
          expect(
            events.filter(event => event.type === 'tool-call'),
          ).toHaveLength(1);
          expect(events.filter(event => event.type === 'tool-result'))
            .toMatchInlineSnapshot(`
          [
            {
              "result": {
                "city": "Austin",
                "temperature": 72,
              },
              "toolCallId": "relay-weather",
              "toolName": "get_weather",
              "type": "tool-result",
            },
          ]
        `);
        } finally {
          resolveResult({ output: { city: 'Austin', temperature: 72 } });
          relay.unbindTurn({ turn });
          await relay.close();
        }
      } finally {
        controller.cancelAll();
        authorization.close();
        emitter.close();
      }
    },
  );
});
