import type { BridgeEvent, BridgeTurn } from '@ai-sdk/harness/bridge';
import type {
  RequestPermissionRequest,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createACPPermissionController } from './permission-controller';

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
}: {
  toolCallId: string;
  kind?: ToolCallUpdate['kind'];
  requestOptions?: RequestPermissionRequest['options'];
}): RequestPermissionRequest {
  return {
    sessionId: 'session-1',
    toolCall: {
      toolCallId,
      kind,
      status: 'pending',
      rawInput: { command: 'pwd' },
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
        sessionId: 'session-1',
        permissionMode: 'allow-all',
        hasPermissionModeMapping: true,
        emitToolCall: ({ toolCall }) => {
          order.push(`tool-call:${toolCall.toolCallId}`);
        },
        claimHostToolPermission: () => false,
      });
      const request = controller.requestPermission(
        permissionRequest({ toolCallId: 'call-1' }),
      );
      const approvalId = getApprovalId({ events: fake.events });
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
    const claimHostToolPermission = vi.fn(() => true);
    const controller = createACPPermissionController({
      turn: fake.turn,
      sessionId: 'session-1',
      permissionMode: 'allow-all',
      hasPermissionModeMapping: true,
      emitToolCall,
      claimHostToolPermission,
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
      sessionId: 'session-1',
      permissionMode: 'allow-all',
      hasPermissionModeMapping: true,
      emitToolCall,
      claimHostToolPermission: () => false,
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
      sessionId: 'session-1',
      permissionMode: 'allow-all',
      hasPermissionModeMapping: true,
      emitToolCall: () => {},
      claimHostToolPermission: () => false,
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
    'auto-approves $kind for an unmapped $permissionMode implementation',
    async ({ permissionMode, kind }) => {
      const fake = createFakeTurn();
      const emitToolCall = vi.fn();
      const controller = createACPPermissionController({
        turn: fake.turn,
        sessionId: 'session-1',
        permissionMode,
        hasPermissionModeMapping: false,
        emitToolCall,
        claimHostToolPermission: () => false,
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
        sessionId: 'session-1',
        permissionMode,
        hasPermissionModeMapping: false,
        emitToolCall: () => {},
        claimHostToolPermission: () => false,
      });
      const request = controller.requestPermission(
        permissionRequest({ toolCallId: 'call-1', kind }),
      );
      const approvalId = getApprovalId({ events: fake.events });

      fake.respond({ approvalId, approved: false });
      await expect(request).resolves.toEqual({
        outcome: { outcome: 'selected', optionId: 'reject-once' },
      });
    },
  );

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
        sessionId: 'session-1',
        permissionMode,
        hasPermissionModeMapping: true,
        emitToolCall: () => {},
        claimHostToolPermission: () => false,
      });
      const request = controller.requestPermission(
        permissionRequest({ toolCallId: 'call-1', kind }),
      );
      const approvalId = getApprovalId({ events: fake.events });

      fake.respond({ approvalId, approved: true });
      await expect(request).resolves.toEqual({
        outcome: { outcome: 'selected', optionId: 'allow-once' },
      });
    },
  );
});
