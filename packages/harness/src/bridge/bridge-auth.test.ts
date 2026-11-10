import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import {
  createBridgeAuthKeyPair,
  createBridgeAuthProof,
  parseBridgeAuthPrivateKey,
} from '../utils/bridge-auth';
import {
  authenticateBridgeConnection,
  parseBridgeAuthPublicKey,
} from './bridge-auth';

class FakeSocket extends EventEmitter {
  readonly sent: string[] = [];
  closeCode: number | undefined;
  terminated = false;

  send(frame: string): void {
    this.sent.push(frame);
  }

  close(code: number): void {
    this.closeCode = code;
    this.emit('close', code);
  }

  terminate(): void {
    this.terminated = true;
    this.emit('close', 1006);
  }
}

function startAuthentication({
  publicKey,
  timeoutMs,
}: {
  publicKey: string;
  timeoutMs?: number;
}) {
  const socket = new FakeSocket();
  const onAuthenticated = vi.fn();
  authenticateBridgeConnection({
    ws: socket as unknown as WebSocket,
    publicKey: parseBridgeAuthPublicKey({ publicKey }),
    timeoutMs,
    onAuthenticated,
  });
  return { socket, onAuthenticated, challenge: socket.sent[0]! };
}

function proofFor({
  privateKey,
  challenge,
}: {
  privateKey: string;
  challenge: string;
}): Buffer {
  return Buffer.from(
    createBridgeAuthProof({
      privateKey: parseBridgeAuthPrivateKey({ privateKey }),
      message: challenge,
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('parseBridgeAuthPublicKey', () => {
  it.each([undefined, '', 'not-a-key', 'A'.repeat(44)])(
    'rejects %s',
    publicKey => {
      expect(() => parseBridgeAuthPublicKey({ publicKey })).toThrow(
        'The bridge requires a valid Ed25519 public key for authentication.',
      );
    },
  );

  it('accepts a generated public key', () => {
    const { publicKey } = createBridgeAuthKeyPair();
    expect(parseBridgeAuthPublicKey({ publicKey }).asymmetricKeyType).toBe(
      'ed25519',
    );
  });
});

describe('authenticateBridgeConnection', () => {
  it('accepts a valid proof for the current challenge', () => {
    const keyPair = createBridgeAuthKeyPair();
    const { socket, onAuthenticated, challenge } = startAuthentication({
      publicKey: keyPair.publicKey,
    });

    socket.emit(
      'message',
      proofFor({ privateKey: keyPair.privateKey, challenge }),
      false,
    );

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(socket.closeCode).toBeUndefined();
  });

  it('sends a fresh challenge for every connection', () => {
    const { publicKey } = createBridgeAuthKeyPair();
    const first = startAuthentication({ publicKey });
    const second = startAuthentication({ publicKey });

    expect(first.challenge).toMatch(/"type":"bridge-auth-challenge"/);
    expect(first.challenge).not.toBe(second.challenge);
  });

  it('rejects a proof replayed from another challenge', () => {
    const keyPair = createBridgeAuthKeyPair();
    const first = startAuthentication({ publicKey: keyPair.publicKey });
    const second = startAuthentication({ publicKey: keyPair.publicKey });

    second.socket.emit(
      'message',
      proofFor({
        privateKey: keyPair.privateKey,
        challenge: first.challenge,
      }),
      false,
    );

    expect(second.onAuthenticated).not.toHaveBeenCalled();
    expect(second.socket.closeCode).toBe(1008);
  });

  it('rejects a proof signed by another key', () => {
    const keyPair = createBridgeAuthKeyPair();
    const { socket, onAuthenticated, challenge } = startAuthentication({
      publicKey: keyPair.publicKey,
    });

    socket.emit(
      'message',
      proofFor({
        privateKey: createBridgeAuthKeyPair().privateKey,
        challenge,
      }),
      false,
    );

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(socket.closeCode).toBe(1008);
  });

  it.each([
    {
      name: 'binary frames',
      frame: (proof: Buffer) => proof,
      isBinary: true,
    },
    {
      name: 'oversized frames',
      frame: () => Buffer.alloc(1_025, 'a'),
      isBinary: false,
    },
    {
      name: 'commands',
      frame: () => Buffer.from(JSON.stringify({ type: 'start' })),
      isBinary: false,
    },
  ])('rejects $name', ({ frame, isBinary }) => {
    const keyPair = createBridgeAuthKeyPair();
    const { socket, onAuthenticated, challenge } = startAuthentication({
      publicKey: keyPair.publicKey,
    });

    socket.emit(
      'message',
      frame(proofFor({ privateKey: keyPair.privateKey, challenge })),
      isBinary,
    );

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(socket.closeCode).toBe(1008);
  });

  it('terminates connections that do not authenticate in time', () => {
    vi.useFakeTimers();
    const { socket, onAuthenticated } = startAuthentication({
      publicKey: createBridgeAuthKeyPair().publicKey,
      timeoutMs: 100,
    });

    vi.advanceTimersByTime(100);

    expect(socket.terminated).toBe(true);
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
