import { describe, expect, it, vi } from 'vitest';
import type { RealtimeClientEvent } from '../types/realtime-model';
import { deferred } from './__fixtures__/fake-realtime';
import { RealtimeCommandCoordinator } from './realtime-command-coordinator';

const noAckCommands = [
  { type: 'backend-input-create', content: [{ type: 'text', text: 'hello' }] },
  { type: 'backend-response-create' },
  { type: 'input-audio-append', audio: 'AAAA' },
  { type: 'session-start', config: {} },
  { type: 'session-close' },
] satisfies RealtimeClientEvent[];

const acknowledgedCommands = [
  { type: 'session-update', config: {} },
  { type: 'context-append', content: 'context', delegationId: null },
  { type: 'input-audio-mute' },
  { type: 'input-audio-unmute' },
] satisfies RealtimeClientEvent[];

function coordinator(send = vi.fn(async (_event: RealtimeClientEvent) => {})) {
  return new RealtimeCommandCoordinator({
    send,
    active: () => true,
    autoContinue: false,
    onError: vi.fn(),
  });
}

describe('normalized realtime command completion', () => {
  it.each(noAckCommands)(
    'turns over 4100 identified $type sends without an ACK and protects recent IDs',
    async command => {
      const send = vi.fn(async (_event: RealtimeClientEvent) => {});
      const commands = coordinator(send);
      for (let index = 0; index < 4100; index++)
        await commands.send({ ...command, eventId: `id-${index}` });
      expect(send).toHaveBeenCalledTimes(4100);
      expect(() => commands.send({ ...command, eventId: 'id-4099' })).toThrow(
        'fresh eventId',
      );
      await commands.receive({
        type: 'error',
        clientEventId: 'id-4099',
        message: 'late rejection',
        raw: {},
      });
      expect(() => commands.send({ ...command, eventId: 'id-4099' })).toThrow(
        'fresh eventId',
      );
      await commands.send({ ...command, eventId: 'corrected' });
      await commands.send({ ...command, eventId: 'id-0' });
      await commands.send({ type: 'input-audio-mute', eventId: 'mute' });
      await commands.send({
        type: 'session-update',
        config: {},
        eventId: 'update',
      });
    },
  );

  it.each(acknowledgedCommands)(
    'keeps successful $type pending until a real ACK or error',
    async command => {
      const commands = coordinator();
      for (let index = 0; index < 512; index++)
        await commands.send({ ...command, eventId: `id-${index}` });
      expect(() => commands.send({ ...command, eventId: 'overflow' })).toThrow(
        'pending',
      );
      await commands.receive({
        type: 'command-acknowledged',
        command: command.type,
        clientEventId: 'id-0',
        raw: {},
      });
      await commands.send({ ...command, eventId: 'after-ack' });
      expect(() => commands.send({ ...command, eventId: 'overflow' })).toThrow(
        'pending',
      );
      await commands.receive({
        type: 'error',
        clientEventId: 'id-1',
        message: 'rejected',
        raw: {},
      });
      await commands.send({ ...command, eventId: 'after-error' });
      expect(() => commands.send({ ...command, eventId: 'id-1' })).toThrow(
        'fresh eventId',
      );
    },
  );

  it.each(noAckCommands)(
    'retains failed $type IDs for correlation while admitting fresh retries without a lifetime quota',
    async command => {
      const send = vi.fn(async (_event: RealtimeClientEvent) => {});
      const commands = coordinator(send);
      for (let index = 0; index < 600; index++) {
        send.mockRejectedValueOnce(new Error('send failed'));
        await expect(
          commands.send({ ...command, eventId: `failed-${index}` }),
        ).rejects.toThrow('send failed');
        await commands.send({ ...command, eventId: `retry-${index}` });
      }
      await commands.receive({
        type: 'error',
        clientEventId: 'failed-599',
        message: 'late failure',
        raw: {},
      });
      expect(() =>
        commands.send({ ...command, eventId: 'failed-599' }),
      ).toThrow('fresh eventId');
      expect(() => commands.send({ ...command, eventId: 'retry-599' })).toThrow(
        'fresh eventId',
      );
      await commands.send({ ...command, eventId: 'fresh' });
    },
  );

  it('does not evict unresolved no-ACK sends to admit more work', async () => {
    const pending = deferred<void>();
    const commands = coordinator(vi.fn(() => pending.promise));
    const sends = Array.from({ length: 512 }, (_, index) =>
      commands.send({
        type: 'backend-input-create',
        content: [],
        eventId: `pending-${index}`,
      }),
    );
    expect(() =>
      commands.send({
        type: 'input-audio-append',
        audio: 'AAAA',
        eventId: 'overflow',
      }),
    ).toThrow('pending');
    pending.resolve();
    await Promise.all(sends);
    await commands.send({
      type: 'input-audio-append',
      audio: 'AAAA',
      eventId: 'admitted',
    });
  });

  it('releases a synchronously failed no-ACK send while retaining its ID', async () => {
    const send = vi.fn(async (_event: RealtimeClientEvent) => {});
    const commands = coordinator(send);
    send.mockImplementationOnce(() => {
      throw new Error('synchronous send failure');
    });
    expect(() =>
      commands.send({ type: 'backend-response-create', eventId: 'failed' }),
    ).toThrow('synchronous send failure');
    expect(() =>
      commands.send({ type: 'backend-response-create', eventId: 'failed' }),
    ).toThrow('fresh eventId');
    await commands.send({ type: 'backend-response-create', eventId: 'retry' });
  });
});
