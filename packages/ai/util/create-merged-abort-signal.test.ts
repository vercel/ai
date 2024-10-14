import { createMergedAbortSignal } from './create-merged-abort-signal';

it('should return a new AbortSignal', () => {
  const signal1 = new AbortController().signal;
  const signal2 = new AbortController().signal;
  const mergedSignal = createMergedAbortSignal(signal1, signal2);

  expect(mergedSignal).toBeInstanceOf(AbortSignal);
});

it('should abort immediately if one of the input signals is already aborted', () => {
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  controller1.abort();

  const mergedSignal = createMergedAbortSignal(
    controller1.signal,
    controller2.signal,
  );

  expect(mergedSignal.aborted).toBe(true);
});

it('should abort when any of the input signals is aborted', () => {
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  const mergedSignal = createMergedAbortSignal(
    controller1.signal,
    controller2.signal,
  );

  expect(mergedSignal.aborted).toBe(false);

  controller1.abort();
  expect(mergedSignal.aborted).toBe(true);
});

it('should remove event listeners after aborting', () => {
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  const removeEventListenerSpy1 = vi.spyOn(
    controller1.signal,
    'removeEventListener',
  );
  const removeEventListenerSpy2 = vi.spyOn(
    controller2.signal,
    'removeEventListener',
  );

  const mergedSignal = createMergedAbortSignal(
    controller1.signal,
    controller2.signal,
  );

  controller1.abort();

  expect(removeEventListenerSpy1).toHaveBeenCalledWith(
    'abort',
    expect.any(Function),
  );
  expect(removeEventListenerSpy2).toHaveBeenCalledWith(
    'abort',
    expect.any(Function),
  );
});

it('should work with multiple signals', () => {
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  const controller3 = new AbortController();
  const mergedSignal = createMergedAbortSignal(
    controller1.signal,
    controller2.signal,
    controller3.signal,
  );

  expect(mergedSignal.aborted).toBe(false);

  controller2.abort();
  expect(mergedSignal.aborted).toBe(true);
});
