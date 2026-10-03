import { describe, expect, it } from 'vitest';
import {
  SteeringClosedError,
  SteeringNotActiveError,
  SteeringSignalAlreadyBoundError,
} from '../error';
import {
  asInternalSteeringSignal,
  SteeringController,
} from './steering-controller';

describe('SteeringController', () => {
  it('should construct with isSteerable === false before binding', () => {
    const controller = new SteeringController();
    expect(controller.signal.isSteerable).toBe(false);
  });

  it('should reject steer() while unbound', async () => {
    const controller = new SteeringController();
    await expect(controller.steer('test message')).rejects.toThrow(
      SteeringNotActiveError,
    );
  });

  it('should transition isSteerable to true when bound', () => {
    const controller = new SteeringController();
    const internal = asInternalSteeringSignal(controller.signal)
      ? controller.signal
      : undefined;
    expect(internal).toBeDefined();

    internal!.bind('call-1');
    expect(controller.signal.isSteerable).toBe(true);
  });

  it('should throw SteeringSignalAlreadyBoundError on multiple binds', () => {
    const controller = new SteeringController();
    const internal = asInternalSteeringSignal(controller.signal)
      ? controller.signal
      : undefined;

    internal!.bind('call-1');
    expect(() => internal!.bind('call-2')).toThrow(
      SteeringSignalAlreadyBoundError,
    );
  });

  it('should enqueue steer() and preserve FIFO ordering upon drain()', async () => {
    const controller = new SteeringController();
    const internal = asInternalSteeringSignal(controller.signal)!;
    internal.bind('call-1');

    const steerPromise1 = controller.steer('message 1');
    const steerPromise2 = controller.steer('message 2');

    const items = internal.drain();
    expect(items).toHaveLength(2);
    expect(items[0].messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'message 1' }] },
    ]);
    expect(items[1].messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'message 2' }] },
    ]);

    // Resolve receipts
    items[0].resolve({ stepNumber: 1 });
    items[1].resolve({ stepNumber: 1 });

    const receipt1 = await steerPromise1;
    const receipt2 = await steerPromise2;
    expect(receipt1).toEqual({ stepNumber: 1 });
    expect(receipt2).toEqual({ stepNumber: 1 });
  });

  it('should return empty array on drain() when queue is empty', () => {
    const controller = new SteeringController();
    const internal = asInternalSteeringSignal(controller.signal)!;
    internal.bind('call-1');

    expect(internal.drain()).toEqual([]);
  });

  it('should reject future steer() calls after seal()', async () => {
    const controller = new SteeringController();
    const internal = asInternalSteeringSignal(controller.signal)!;
    internal.bind('call-1');

    internal.seal();
    expect(controller.signal.isSteerable).toBe(false);

    await expect(controller.steer('late message')).rejects.toThrow(
      SteeringClosedError,
    );
  });

  it('should reject future steer() calls after complete()', async () => {
    const controller = new SteeringController();
    const internal = asInternalSteeringSignal(controller.signal)!;
    internal.bind('call-1');

    internal.complete();
    expect(controller.signal.isSteerable).toBe(false);

    await expect(controller.steer('after complete')).rejects.toThrow(
      SteeringClosedError,
    );
  });

  it('should reject pending steering promises on abort()', async () => {
    const controller = new SteeringController();
    const internal = asInternalSteeringSignal(controller.signal)!;
    internal.bind('call-1');

    const steerPromise = controller.steer('will be aborted');
    const abortError = new DOMException('Operation cancelled', 'AbortError');
    internal.abort(abortError);

    expect(controller.signal.isSteerable).toBe(false);
    await expect(steerPromise).rejects.toThrow('Operation cancelled');

    // Future steer() also rejects
    await expect(controller.steer('after abort')).rejects.toThrow(
      'Operation cancelled',
    );
  });

  it('should automatically abort when bound AbortSignal fires', async () => {
    const abortController = new AbortController();
    const controller = new SteeringController();
    const internal = asInternalSteeringSignal(controller.signal)!;
    internal.bind('call-1', abortController.signal);

    const steerPromise = controller.steer('pending');
    abortController.abort(new DOMException('User aborted', 'AbortError'));

    await expect(steerPromise).rejects.toThrow('User aborted');
    expect(controller.signal.isSteerable).toBe(false);
  });
});
