import { describe, expect, it } from 'vitest';
import {
  createAssistantSnapshotBaseline,
  isAssistantSnapshotAfterBaseline,
} from './opencode-context-fallback';

describe('OpenCode context fallback', () => {
  it('rejects the assistant response that existed before the prompt', () => {
    const baseline = createAssistantSnapshotBaseline({
      id: 'previous-assistant',
    });

    expect(
      isAssistantSnapshotAfterBaseline({
        assistant: { id: 'previous-assistant' },
        baseline,
      }),
    ).toBe(false);
  });

  it('accepts an assistant response created after the prompt', () => {
    const baseline = createAssistantSnapshotBaseline({
      id: 'previous-assistant',
    });

    expect(
      isAssistantSnapshotAfterBaseline({
        assistant: { id: 'current-assistant' },
        baseline,
      }),
    ).toBe(true);
  });

  it('fails closed when an existing assistant has no usable id', () => {
    const baseline = createAssistantSnapshotBaseline({});

    expect(
      isAssistantSnapshotAfterBaseline({
        assistant: { id: 'current-assistant' },
        baseline,
      }),
    ).toBe(false);
  });
});
