import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import type { SessionUpdate, ToolCallUpdate } from '@agentclientprotocol/sdk';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ACPToolCall } from '../../acp-tool-call';
import type { ACPBuiltinToolMapping } from '../acp-v1-bridge-protocol';
import { loadWeatherApprovalFixture } from './__fixtures__/weather-approval-fixture';
import { createEmitStreamEvent } from './create-emit-stream-event';
import { createACPPermissionController } from './permission-controller';

type Harness = 'cursor' | 'github-copilot' | 'grok-build';
type ToolUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: 'tool_call' | 'tool_call_update' }
>;
type BuiltinToolApprovalFixture = {
  builtinTools: ACPBuiltinToolMapping[];
  updates: ToolUpdate[];
  permissionToolCall: ToolCallUpdate;
};

function loadFixture({
  harness,
}: {
  harness: Harness;
}): BuiltinToolApprovalFixture {
  return JSON.parse(
    readFileSync(
      new URL(
        `./__fixtures__/${harness}-builtin-tool-approval.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
}

const emitters = new Set<ReturnType<typeof createEmitStreamEvent>>();

function createFixtureEmitter({
  harness = 'cursor',
}: { harness?: Harness } = {}) {
  const fixture = loadFixture({ harness });
  const events: HarnessV1StreamPart[] = [];
  const candidates: ACPToolCall[] = [];
  const emitter = createEmitStreamEvent({
    emit: event => events.push(event),
    emitToolCallCandidate: ({ toolCall }) => candidates.push(toolCall),
    builtinTools: fixture.builtinTools,
    hostToolServerName: 'ai-sdk-harness-tools',
    hostTools: [],
  });
  emitters.add(emitter);
  return {
    fixture,
    emitter,
    events,
    candidates,
    observe({ updates = fixture.updates }: { updates?: ToolUpdate[] } = {}) {
      for (const update of updates) {
        emitter.message({
          message: {
            kind: 'session_update',
            notification: { sessionId: 'session-1', update },
            update,
          },
          rawUpdate: update,
        });
      }
    },
  };
}

function toolCalls({ events }: { events: HarnessV1StreamPart[] }) {
  return events.filter(event => event.type === 'tool-call');
}

function replayApproval({ harness }: { harness: Harness }) {
  const replay = createFixtureEmitter({ harness });
  replay.observe();
  replay.emitter.permissionToolCall({
    toolCall: replay.fixture.permissionToolCall,
  });
  const calls = toolCalls(replay);
  expect(calls).toHaveLength(1);
  expect(calls[0].toolName).toBe('bash');
  expect(replay.candidates[0]._meta).toEqual(
    replay.fixture.permissionToolCall._meta,
  );
  const { input, nativeName, providerExecuted, toolName } = calls[0];
  return { input: JSON.parse(input), nativeName, providerExecuted, toolName };
}

describe('ACP built-in tool approval input', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const emitter of emitters) emitter.close();
    emitters.clear();
    vi.useRealTimers();
  });

  it('recovers the captured Cursor command before correlation flushes', () => {
    expect(replayApproval({ harness: 'cursor' })).toMatchInlineSnapshot(`
      {
        "input": {
          "command": "echo 'Tool approval succeeded.' > approval-example.txt",
        },
        "nativeName": "shellToolCall",
        "providerExecuted": true,
        "toolName": "bash",
      }
    `);
  });

  it('preserves the captured Copilot permission input instead of merging properties', () => {
    expect(replayApproval({ harness: 'github-copilot' }))
      .toMatchInlineSnapshot(`
      {
        "input": {
          "command": "echo 'Tool approval succeeded.' > approval-example.txt",
          "commands": [
            "echo 'Tool approval succeeded.' > approval-example.txt",
          ],
        },
        "nativeName": undefined,
        "providerExecuted": true,
        "toolName": "bash",
      }
    `);
  });

  it('preserves the captured Grok Build permission input and native tool name', () => {
    expect(replayApproval({ harness: 'grok-build' })).toMatchInlineSnapshot(`
      {
        "input": {
          "command": "cat > approval-example.txt << 'EOF'
      Tool approval succeeded.
      EOF",
          "description": "Create a new text file named approval-example.txt with the exact content "Tool approval succeeded."",
          "is_background": false,
          "variant": "Bash",
        },
        "nativeName": "run_terminal_command",
        "providerExecuted": true,
        "toolName": "bash",
      }
    `);
  });

  it.each(['cursor', 'github-copilot', 'grok-build'] as const)(
    'does not duplicate %s calls when buffered updates are released',
    async harness => {
      const replay = createFixtureEmitter({ harness });
      replay.observe();
      replay.emitter.permissionToolCall({
        toolCall: replay.fixture.permissionToolCall,
      });
      const beforeFlush = [...toolCalls(replay)];
      await vi.advanceTimersByTimeAsync(1000);
      expect(toolCalls(replay)).toEqual(beforeFlush);
      expect(beforeFlush[0].toolName).toBe('bash');
    },
  );

  it.each(['cursor', 'github-copilot', 'grok-build'] as const)(
    'preserves %s calls already emitted before a permission arrives',
    async harness => {
      const replay = createFixtureEmitter({ harness });
      replay.observe();
      await vi.advanceTimersByTimeAsync(1000);
      const beforePermission = [...toolCalls(replay)];
      replay.emitter.permissionToolCall({
        toolCall: replay.fixture.permissionToolCall,
      });
      const calls = toolCalls(replay);
      expect(calls).toHaveLength(1);
      expect(calls[0].toolName).toBe('bash');
      if (beforePermission.length > 0) expect(calls).toEqual(beforePermission);
    },
  );

  it.each([
    { label: 'empty object', rawInput: {} },
    { label: 'null', rawInput: null },
    { label: 'array', rawInput: ['explicit'] },
    { label: 'primitive', rawInput: 'explicit' },
    { label: 'replacement object', rawInput: { command: 'explicit' } },
  ])('preserves explicit $label permission input', ({ rawInput }) => {
    const replay = createFixtureEmitter();
    replay.observe();
    replay.emitter.permissionToolCall({
      toolCall: { ...replay.fixture.permissionToolCall, rawInput },
    });
    expect(toolCalls(replay)[0].input).toBe(JSON.stringify(rawInput ?? {}));
    expect(replay.candidates[0].rawInput).toEqual(rawInput);
  });

  it('recovers explicitly undefined input from the latest observation', () => {
    const replay = createFixtureEmitter();
    replay.observe();
    replay.emitter.permissionToolCall({
      toolCall: { ...replay.fixture.permissionToolCall, rawInput: undefined },
    });
    expect(JSON.parse(toolCalls(replay)[0].input)).toEqual(
      replay.fixture.updates[1].rawInput,
    );
  });

  it('does not recover an input cleared by a later observation', () => {
    const replay = createFixtureEmitter();
    replay.observe();
    replay.observe({
      updates: [{ ...replay.fixture.updates[1], rawInput: null }],
    });
    replay.emitter.permissionToolCall({
      toolCall: replay.fixture.permissionToolCall,
    });
    expect(replay.candidates[0].rawInput).toBeNull();
  });

  it('keeps interleaved tool calls isolated by tool call ID', () => {
    const replay = createFixtureEmitter();
    const firstId = replay.fixture.permissionToolCall.toolCallId;
    const secondId = `${firstId}-second`;
    for (const update of replay.fixture.updates) {
      replay.observe({
        updates: [
          update,
          {
            ...update,
            toolCallId: secondId,
            ...(update.rawInput === undefined
              ? {}
              : { rawInput: { command: 'second' } }),
          },
        ],
      });
    }
    replay.emitter.permissionToolCall({
      toolCall: { ...replay.fixture.permissionToolCall, toolCallId: secondId },
    });
    replay.emitter.permissionToolCall({
      toolCall: replay.fixture.permissionToolCall,
    });
    expect(
      toolCalls(replay).map(({ toolCallId, input }) => ({
        toolCallId,
        input: JSON.parse(input),
      })),
    ).toEqual([
      { toolCallId: secondId, input: { command: 'second' } },
      { toolCallId: firstId, input: replay.fixture.updates[1].rawInput },
    ]);
  });

  it('leaves an unobserved permission without input unchanged', () => {
    const replay = createFixtureEmitter();
    replay.observe();
    replay.emitter.permissionToolCall({
      toolCall: {
        ...replay.fixture.permissionToolCall,
        toolCallId: 'unobserved',
      },
    });
    expect(toolCalls(replay)[0].input).toBe('{}');
    expect(replay.candidates[0].rawInput).toBeUndefined();
    expect(toolCalls(replay)[0].toolName).toBe('acp_tool_unobserved');
  });

  it('does not merge nullable identity or metadata fields from observations', () => {
    const replay = createFixtureEmitter({ harness: 'grok-build' });
    replay.observe();
    replay.emitter.permissionToolCall({
      toolCall: {
        ...replay.fixture.permissionToolCall,
        title: null,
        kind: null,
        status: null,
        content: null,
        locations: null,
        _meta: null,
        rawInput: null,
      },
    });
    const call = toolCalls(replay)[0];
    expect(call.toolName).toBe(`acp_tool_${call.toolCallId}`);
    expect(replay.candidates[0]).toEqual({
      toolCallId: replay.fixture.permissionToolCall.toolCallId,
      title: `Tool ${replay.fixture.permissionToolCall.toolCallId}`,
      _meta: null,
      rawInput: null,
    });
  });

  it('does not identify Bash from a title and kind cleared by the permission', async () => {
    const replay = createFixtureEmitter();
    replay.observe({
      updates: [
        {
          ...replay.fixture.updates[0],
          rawInput: replay.fixture.updates[1].rawInput,
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(toolCalls(replay)).toEqual([]);
    replay.emitter.permissionToolCall({
      toolCall: {
        ...replay.fixture.permissionToolCall,
        title: null,
        kind: null,
        rawInput: null,
      },
    });
    expect(toolCalls(replay)[0].toolName).not.toBe('bash');
    expect(replay.candidates[0].kind).toBeUndefined();
    expect(replay.candidates[0].title).toBe(
      `Tool ${replay.fixture.permissionToolCall.toolCallId}`,
    );
  });

  it.each(['approve', 'reject', 'cancel'] as const)(
    'emits the recovered call before approval and handles %s',
    async outcome => {
      const replay = createFixtureEmitter();
      replay.observe();
      let respond!: (response: { approved: boolean }) => void;
      const controller = createACPPermissionController({
        turn: {
          emit: (event: HarnessV1StreamPart) => replay.events.push(event),
          requestToolApproval: () =>
            new Promise<{ approved: boolean }>(resolve => {
              respond = resolve;
            }),
          emitWarning: vi.fn(),
        } as unknown as BridgeTurn,
        sessionId: 'session-1',
        permissionMode: 'allow-edits',
        hasPermissionModeMapping: false,
        emitToolCall: replay.emitter.permissionToolCall,
        claimHostToolPermission: replay.emitter.claimHostToolPermission,
      });
      try {
        const request = controller.requestPermission({
          sessionId: 'session-1',
          toolCall: replay.fixture.permissionToolCall,
          options: [
            { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'reject', name: 'Reject once', kind: 'reject_once' },
          ],
        });
        expect(
          replay.events
            .filter(event => event.type !== 'raw')
            .map(event => event.type),
        ).toEqual(['tool-call', 'tool-approval-request', 'finish-step']);
        expect(toolCalls(replay)[0].toolName).toBe('bash');
        const approval = replay.events.find(
          event => event.type === 'tool-approval-request',
        );
        expect(approval?.toolCallId).toBe(toolCalls(replay)[0].toolCallId);
        if (outcome === 'cancel') controller.cancelAll();
        else respond({ approved: outcome === 'approve' });
        expect(await request).toEqual(
          outcome === 'cancel'
            ? { outcome: { outcome: 'cancelled' } }
            : {
                outcome: {
                  outcome: 'selected',
                  optionId: outcome === 'approve' ? 'allow' : 'reject',
                },
              },
        );
      } finally {
        controller.cancelAll();
      }
    },
  );

  it.each([
    { harness: 'cursor', delay: 0 },
    { harness: 'cursor', delay: 1000 },
    { harness: 'github-copilot', delay: 0 },
    { harness: 'github-copilot', delay: 1000 },
    { harness: 'fx', delay: 0 },
    { harness: 'fx', delay: 1000 },
  ])(
    'preserves $harness host-tool claims with a $delay ms delay',
    async ({ harness, delay }) => {
      const fixture = loadWeatherApprovalFixture({ harness });
      const events: HarnessV1StreamPart[] = [];
      const emitter = createEmitStreamEvent({
        emit: event => events.push(event),
        emitToolCallCandidate: vi.fn(),
        builtinTools: [],
        hostToolServerName: 'ai-sdk-harness-tools',
        hostTools: [{ name: 'get_weather', inputSchema: { type: 'object' } }],
      });
      emitters.add(emitter);
      for (const event of fixture) {
        if (event.type === 'update') {
          emitter.message({
            message: {
              kind: 'session_update',
              notification: { sessionId: 'session-1', update: event.value },
              update: event.value,
            },
          });
        } else {
          await vi.advanceTimersByTimeAsync(delay);
          expect(
            emitter.claimHostToolPermission({ toolCall: event.value.toolCall }),
          ).toEqual({
            toolName: 'get_weather',
            input: { city: 'Austin' },
          });
        }
      }
      emitter.close();
      expect(events.filter(event => event.type !== 'raw')).toEqual([]);
    },
  );
});
