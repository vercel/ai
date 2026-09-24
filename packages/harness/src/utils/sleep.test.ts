import { describe, expect, it } from 'vitest';
import { sleep } from './sleep';

describe('sleep', () => {
  it('resolves when the abort signal fires', async () => {
    const controller = new AbortController();
    const pending = sleep({ ms: 1_000, abortSignal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toBeUndefined();
  });

  it('resolves immediately for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      sleep({ ms: 1_000, abortSignal: controller.signal }),
    ).resolves.toBeUndefined();
  });
});
