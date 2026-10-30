import type { BridgeEvent, BridgeTurn } from '@ai-sdk/harness/bridge';
import type {
  RequestPermissionRequest,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createACPPermissionController } from './permission-controller';
import { areACPToolLocationsTrusted } from './permission-locations';

let sandboxDir: string;
let workDir: string;
let otherWorkDir: string;

beforeEach(async () => {
  sandboxDir = await mkdtemp(path.join(tmpdir(), 'acp-permissions-'));
  workDir = path.join(sandboxDir, 'session-1');
  otherWorkDir = path.join(sandboxDir, 'session-2');
  await mkdir(workDir);
  await mkdir(otherWorkDir);
  await writeFile(path.join(workDir, 'file.txt'), 'workspace');
  await writeFile(path.join(otherWorkDir, 'file.txt'), 'other workspace');
});

afterEach(async () => {
  await rm(sandboxDir, { recursive: true, force: true });
});

const options: RequestPermissionRequest['options'] = [
  { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
  { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'reject-always', name: 'Reject always', kind: 'reject_always' },
  { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' },
];

function permissionRequest({
  toolCallId,
  kind = 'execute',
  requestOptions = options,
  toolCall = {},
}: {
  toolCallId: string;
  kind?: ToolCallUpdate['kind'];
  requestOptions?: RequestPermissionRequest['options'];
  toolCall?: Partial<ToolCallUpdate>;
}): RequestPermissionRequest {
  return {
    sessionId: 'session-1',
    toolCall: {
      toolCallId,
      kind,
      status: 'pending',
      rawInput: { command: 'pwd' },
      locations: [{ path: path.join(workDir, 'file.txt') }],
      ...toolCall,
    },
    options: [...requestOptions],
  };
}

function createFakeTurn() {
  const events: BridgeEvent[] = [];
  const warnings: string[] = [];
  const approvalResolvers = new Map<
    string,
    (response: { approved: boolean; reason?: string }) => void
  >();
  const turn = {
    emit: (event: BridgeEvent) => events.push(event),
    requestToolApproval: (approvalId: string) =>
      new Promise<{ approved: boolean; reason?: string }>(resolve => {
        approvalResolvers.set(approvalId, resolve);
      }),
    emitWarning: ({ message }: { message: string }) => warnings.push(message),
  } as unknown as BridgeTurn;
  return {
    turn,
    events,
    warnings,
    respond({
      approvalId,
      approved,
    }: {
      approvalId: string;
      approved: boolean;
    }) {
      approvalResolvers.get(approvalId)?.({ approved });
      approvalResolvers.delete(approvalId);
    },
  };
}

function getApprovalId({ events }: { events: BridgeEvent[] }): string {
  const event = events.find(item => item.type === 'tool-approval-request');
  if (event?.type !== 'tool-approval-request') {
    throw new Error('Expected a tool approval request.');
  }
  const approvalId = Reflect.get(event, 'approvalId');
  if (typeof approvalId !== 'string') {
    throw new Error('Expected a string approval ID.');
  }
  return approvalId;
}

describe('ACP permission controller', () => {
  describe('location resolution', () => {
    beforeEach(async () => {
      await mkdir(path.join(workDir, 'nested'));
      await mkdir(path.join(otherWorkDir, 'nested'));
      await symlink(otherWorkDir, path.join(workDir, 'external'), 'dir');
      await symlink(
        path.join(otherWorkDir, 'nested'),
        path.join(workDir, 'external-nested'),
        'dir',
      );
      await symlink(
        path.join(workDir, 'nested'),
        path.join(workDir, 'internal'),
        'dir',
      );
      await symlink(
        path.join(otherWorkDir, 'missing'),
        path.join(workDir, 'dangling'),
      );
      await symlink('loop', path.join(workDir, 'loop'));
    });

    it.each([
      { location: 'file.txt', trusted: true },
      { location: './nested/../file.txt', trusted: true },
      { location: '.', trusted: true },
      { location: '..config', trusted: true },
      { location: 'new/nested/file.txt', trusted: true },
      { location: 'internal/new/file.txt', trusted: true },
      { location: '../session-2/file.txt', trusted: false },
      { location: '../session-1-other/file.txt', trusted: false },
      { location: 'external/file.txt', trusted: false },
      { location: 'external/new/file.txt', trusted: false },
      { location: 'external-nested/../file.txt', trusted: false },
      { location: 'dangling', trusted: false },
      { location: 'dangling/new/file.txt', trusted: false },
      { location: 'loop', trusted: false },
      { location: 'file.txt/child', trusted: false },
      { location: 'missing/../file.txt', trusted: false },
      { location: '', trusted: false },
      { location: ' ', trusted: false },
      { location: 'file\0.txt', trusted: false },
    ])(
      'resolves $location as trusted=$trusted',
      async ({ location, trusted }) => {
        await expect(
          areACPToolLocationsTrusted({
            workDir,
            toolCall: {
              toolCallId: 'call-1',
              kind: 'edit',
              locations: [{ path: location }],
            },
          }),
        ).resolves.toBe(trusted);
      },
    );

    it('resolves a symlinked working directory before comparing locations', async () => {
      const alias = path.join(sandboxDir, 'workspace-alias');
      await symlink(workDir, alias, 'dir');
      await expect(
        areACPToolLocationsTrusted({
          workDir: alias,
          toolCall: {
            toolCallId: 'call-1',
            kind: 'read',
            locations: [{ path: path.join(alias, 'file.txt') }],
          },
        }),
      ).resolves.toBe(true);
    });

    it('requires approval if the working directory cannot be resolved', async () => {
      const missingWorkDir = path.join(sandboxDir, 'missing');
      await expect(
        areACPToolLocationsTrusted({
          workDir: missingWorkDir,
          toolCall: {
            toolCallId: 'call-1',
            kind: 'read',
            locations: [{ path: path.join(missingWorkDir, 'file.txt') }],
          },
        }),
      ).resolves.toBe(false);
    });

    it.each(['think', 'fetch'] as const)(
      'allows %s without file locations',
      async kind => {
        await expect(
          areACPToolLocationsTrusted({
            workDir,
            toolCall: { toolCallId: 'call-1', kind },
          }),
        ).resolves.toBe(true);
      },
    );
  });

  it.each([
    { approved: true, expectedOptionId: 'allow-once' },
    { approved: false, expectedOptionId: 'reject-once' },
  ])(
    'maps approved=$approved only to the advertised one-time choice',
    async ({ approved, expectedOptionId }) => {
      const fake = createFakeTurn();
      const order: string[] = [];
      const controller = createACPPermissionController({
        turn: fake.turn,
        workDir,
        sessionId: 'session-1',
        permissionMode: 'allow-all',
        hasPermissionModeMapping: true,
        emitToolCall: ({ toolCall }) => {
          order.push(`tool-call:${toolCall.toolCallId}`);
        },
        claimHostToolPermission: async () => undefined,
      });
      const request = controller.requestPermission(
        permissionRequest({ toolCallId: 'call-1' }),
      );
      const approvalId = await vi.waitFor(() =>
        getApprovalId({ events: fake.events }),
      );
      order.push(`approval:${approvalId}`);

      let settled = false;
      void request.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(order).toEqual(['tool-call:call-1', `approval:${approvalId}`]);
      expect(fake.events).toContainEqual({
        type: 'tool-approval-request',
        approvalId,
        toolCallId: 'call-1',
      });

      fake.respond({ approvalId, approved });
      await expect(request).resolves.toEqual({
        outcome: {
          outcome: 'selected',
          optionId: expectedOptionId,
        },
      });
    },
  );

  it('releases a proven host tool to the MCP relay without native approval', async () => {
    const fake = createFakeTurn();
    const emitToolCall = vi.fn();
    const call = { toolName: 'weather', input: { city: 'Austin' } };
    const claimHostToolPermission = vi.fn(async () => call);
    const onHostToolPermissionAllowed = vi.fn();
    const controller = createACPPermissionController({
      turn: fake.turn,
      workDir,
      sessionId: 'session-1',
      permissionMode: 'allow-all',
      hasPermissionModeMapping: true,
      emitToolCall,
      claimHostToolPermission,
      onHostToolPermissionAllowed,
    });
    const request = permissionRequest({ toolCallId: 'toolu_host' });

    await expect(controller.requestPermission(request)).resolves.toEqual({
      outcome: {
        outcome: 'selected',
        optionId: 'allow-once',
      },
    });
    expect(claimHostToolPermission).toHaveBeenCalledWith({
      toolCall: request.toolCall,
    });
    expect(onHostToolPermissionAllowed).toHaveBeenCalledExactlyOnceWith({
      toolCallId: request.toolCall.toolCallId,
      call,
    });
    expect(emitToolCall).not.toHaveBeenCalled();
    expect(fake.events).toEqual([]);
  });

  it.each([
    {
      name: 'allow_once',
      requestOptions: options.filter(option => option.kind !== 'allow_once'),
    },
    {
      name: 'reject_once',
      requestOptions: options.filter(option => option.kind !== 'reject_once'),
    },
  ])('fails closed when $name is missing', async ({ name, requestOptions }) => {
    const fake = createFakeTurn();
    const emitToolCall = vi.fn();
    const controller = createACPPermissionController({
      turn: fake.turn,
      workDir,
      sessionId: 'session-1',
      permissionMode: 'allow-all',
      hasPermissionModeMapping: true,
      emitToolCall,
      claimHostToolPermission: async () => undefined,
    });

    await expect(
      controller.requestPermission(
        permissionRequest({
          toolCallId: 'call-1',
          requestOptions,
        }),
      ),
    ).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(fake.warnings[0]).toContain(`did not advertise ${name}`);
    expect(emitToolCall).not.toHaveBeenCalled();
    expect(fake.events).toEqual([]);
  });

  it('cancels every pending ACP request', async () => {
    const fake = createFakeTurn();
    const controller = createACPPermissionController({
      turn: fake.turn,
      workDir,
      sessionId: 'session-1',
      permissionMode: 'allow-all',
      hasPermissionModeMapping: true,
      emitToolCall: () => {},
      claimHostToolPermission: async () => undefined,
    });
    const first = controller.requestPermission(
      permissionRequest({ toolCallId: 'call-1' }),
    );
    const second = controller.requestPermission(
      permissionRequest({ toolCallId: 'call-2' }),
    );
    controller.cancelAll();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { outcome: { outcome: 'cancelled' } },
      { outcome: { outcome: 'cancelled' } },
    ]);
  });

  it.each([
    { permissionMode: 'allow-all', kind: 'execute' },
    { permissionMode: 'allow-all', kind: 'other' },
    { permissionMode: 'allow-edits', kind: 'edit' },
    { permissionMode: 'allow-edits', kind: 'delete' },
    { permissionMode: 'allow-edits', kind: 'move' },
    { permissionMode: 'allow-reads', kind: 'read' },
    { permissionMode: 'allow-reads', kind: 'search' },
    { permissionMode: 'allow-reads', kind: 'think' },
    { permissionMode: 'allow-reads', kind: 'fetch' },
  ] as const)(
    'auto-approves $kind for an unmapped $permissionMode agent',
    async ({ permissionMode, kind }) => {
      const fake = createFakeTurn();
      const emitToolCall = vi.fn();
      const controller = createACPPermissionController({
        turn: fake.turn,
        workDir,
        sessionId: 'session-1',
        permissionMode,
        hasPermissionModeMapping: false,
        emitToolCall,
        claimHostToolPermission: async () => undefined,
      });

      await expect(
        controller.requestPermission(
          permissionRequest({ toolCallId: 'call-1', kind }),
        ),
      ).resolves.toEqual({
        outcome: { outcome: 'selected', optionId: 'allow-once' },
      });
      expect(emitToolCall).not.toHaveBeenCalled();
      expect(fake.events).toEqual([]);
    },
  );

  it.each([
    { permissionMode: 'allow-reads', kind: 'edit' },
    { permissionMode: 'allow-reads', kind: 'execute' },
    { permissionMode: 'allow-edits', kind: 'execute' },
    { permissionMode: 'allow-edits', kind: 'other' },
    { permissionMode: 'allow-edits', kind: 'switch_mode' },
  ] as const)(
    'requests host approval for $kind with unmapped $permissionMode',
    async ({ permissionMode, kind }) => {
      const fake = createFakeTurn();
      const controller = createACPPermissionController({
        turn: fake.turn,
        workDir,
        sessionId: 'session-1',
        permissionMode,
        hasPermissionModeMapping: false,
        emitToolCall: () => {},
        claimHostToolPermission: async () => undefined,
      });
      const request = controller.requestPermission(
        permissionRequest({ toolCallId: 'call-1', kind }),
      );
      const approvalId = await vi.waitFor(() =>
        getApprovalId({ events: fake.events }),
      );

      fake.respond({ approvalId, approved: false });
      await expect(request).resolves.toEqual({
        outcome: { outcome: 'selected', optionId: 'reject-once' },
      });
    },
  );

  describe.each([
    { permissionMode: 'allow-reads', kind: 'read' },
    { permissionMode: 'allow-reads', kind: 'search' },
    { permissionMode: 'allow-edits', kind: 'read' },
    { permissionMode: 'allow-edits', kind: 'search' },
    { permissionMode: 'allow-edits', kind: 'edit' },
    { permissionMode: 'allow-edits', kind: 'delete' },
    { permissionMode: 'allow-edits', kind: 'move' },
  ] as const)(
    '$permissionMode $kind location checks',
    ({ permissionMode, kind }) => {
      it.each(['absolute', 'relative', 'mixed'] as const)(
        'requires approval for %s locations outside the workspace',
        async locationType => {
          const fake = createFakeTurn();
          const emitToolCall = vi.fn();
          const controller = createACPPermissionController({
            turn: fake.turn,
            workDir,
            sessionId: 'session-1',
            permissionMode,
            hasPermissionModeMapping: false,
            emitToolCall,
            claimHostToolPermission: async () => undefined,
          });
          const externalPath = path.join(otherWorkDir, 'file.txt');
          const toolCall = {
            title: 'Access paths outside trusted directories',
            rawInput: { path: externalPath },
            locations:
              locationType === 'relative'
                ? [{ path: '../session-2/file.txt' }]
                : locationType === 'mixed'
                  ? [
                      { path: path.join(workDir, 'file.txt') },
                      { path: externalPath },
                    ]
                  : [{ path: externalPath }],
          };
          const permission = permissionRequest({
            toolCallId: 'call-1',
            kind,
            toolCall,
          });
          const request = controller.requestPermission(permission);
          await vi.waitFor(() => {
            expect(fake.events).toContainEqual(
              expect.objectContaining({ type: 'tool-approval-request' }),
            );
          });
          const approvalId = getApprovalId({ events: fake.events });
          expect(emitToolCall).toHaveBeenCalledExactlyOnceWith({
            toolCall: permission.toolCall,
          });
          fake.respond({ approvalId, approved: false });
          await expect(request).resolves.toEqual({
            outcome: { outcome: 'selected', optionId: 'reject-once' },
          });
        },
      );
    },
  );

  it.each([undefined, null, []])(
    'requires approval when file locations are %s, even with a rawInput path',
    async locations => {
      const fake = createFakeTurn();
      const controller = createACPPermissionController({
        turn: fake.turn,
        workDir,
        sessionId: 'session-1',
        permissionMode: 'allow-reads',
        hasPermissionModeMapping: false,
        emitToolCall: () => {},
        claimHostToolPermission: async () => undefined,
      });
      const request = controller.requestPermission(
        permissionRequest({
          toolCallId: 'call-1',
          kind: 'read',
          toolCall: {
            locations,
            rawInput: { path: path.join(workDir, 'file.txt') },
          },
        }),
      );
      await vi.waitFor(() => expect(fake.events.length).toBeGreaterThan(0));
      const approvalId = getApprovalId({ events: fake.events });
      fake.respond({ approvalId, approved: true });
      await expect(request).resolves.toEqual({
        outcome: { outcome: 'selected', optionId: 'allow-once' },
      });
    },
  );

  it('preserves allow-all for external file locations', async () => {
    const fake = createFakeTurn();
    const controller = createACPPermissionController({
      turn: fake.turn,
      workDir,
      sessionId: 'session-1',
      permissionMode: 'allow-all',
      hasPermissionModeMapping: false,
      emitToolCall: () => {},
      claimHostToolPermission: async () => undefined,
    });
    await expect(
      controller.requestPermission(
        permissionRequest({
          toolCallId: 'call-1',
          kind: 'edit',
          toolCall: {
            locations: [{ path: path.join(otherWorkDir, 'file.txt') }],
          },
        }),
      ),
    ).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow-once' },
    });
    expect(fake.events).toEqual([]);
  });

  it('cancels permissions while file locations are being checked', async () => {
    const fake = createFakeTurn();
    const controller = createACPPermissionController({
      turn: fake.turn,
      workDir,
      sessionId: 'session-1',
      permissionMode: 'allow-reads',
      hasPermissionModeMapping: false,
      emitToolCall: () => {},
      claimHostToolPermission: async () => undefined,
    });
    const request = controller.requestPermission(
      permissionRequest({ toolCallId: 'call-1', kind: 'read' }),
    );
    await Promise.resolve();
    controller.cancelAll();
    await expect(request).resolves.toEqual({
      outcome: { outcome: 'cancelled' },
    });
    expect(fake.events).toEqual([]);
  });

  it.each([
    { permissionMode: 'allow-reads', kind: 'read' },
    { permissionMode: 'allow-edits', kind: 'edit' },
    { permissionMode: 'allow-all', kind: 'execute' },
  ] as const)(
    'requests host approval for mapped $permissionMode even for $kind',
    async ({ permissionMode, kind }) => {
      const fake = createFakeTurn();
      const controller = createACPPermissionController({
        turn: fake.turn,
        workDir,
        sessionId: 'session-1',
        permissionMode,
        hasPermissionModeMapping: true,
        emitToolCall: () => {},
        claimHostToolPermission: async () => undefined,
      });
      const request = controller.requestPermission(
        permissionRequest({ toolCallId: 'call-1', kind }),
      );
      const approvalId = await vi.waitFor(() =>
        getApprovalId({ events: fake.events }),
      );

      fake.respond({ approvalId, approved: true });
      await expect(request).resolves.toEqual({
        outcome: { outcome: 'selected', optionId: 'allow-once' },
      });
    },
  );
});
