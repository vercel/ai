import type { World } from '@workflow/world';
import { describe, expect, test, vi } from 'vitest';
import {
  getDurableHarnessAgent,
  getDurableHarnessAgents,
  registerDurableHarnessAgent,
} from './durable-agent-registry';

type DurableHarnessAgentRegistryEntry = Parameters<
  typeof registerDurableHarnessAgent
>[0];

function createEntry(options: {
  id: string;
}): DurableHarnessAgentRegistryEntry {
  return {
    id: options.id,
    world: {} as never as World,
    createSession: vi.fn(),
    drive: vi.fn(),
  };
}

describe('durable HarnessAgent registry', () => {
  test('registers an agent under its id', () => {
    const entry = createEntry({ id: 'registry-registers' });

    registerDurableHarnessAgent(entry);

    expect(getDurableHarnessAgent({ id: 'registry-registers' })).toBe(entry);
    expect(getDurableHarnessAgents()).toContain(entry);
  });

  test('returns undefined for an unknown id', () => {
    expect(getDurableHarnessAgent({ id: 'registry-unknown' })).toBeUndefined();
  });

  test('rejects a second agent with the same id in the same tick', () => {
    registerDurableHarnessAgent(createEntry({ id: 'registry-same-tick' }));

    expect(() =>
      registerDurableHarnessAgent(createEntry({ id: 'registry-same-tick' })),
    ).toThrow('two durable HarnessAgents have the `id` `registry-same-tick`');
  });

  test('replaces an agent registered in an earlier tick', async () => {
    registerDurableHarnessAgent(createEntry({ id: 'registry-replaces' }));
    await Promise.resolve();
    const replacement = createEntry({ id: 'registry-replaces' });

    registerDurableHarnessAgent(replacement);

    expect(getDurableHarnessAgent({ id: 'registry-replaces' })).toBe(
      replacement,
    );
  });
});
