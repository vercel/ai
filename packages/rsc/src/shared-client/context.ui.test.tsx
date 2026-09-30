import { act, render } from '@testing-library/react';
import type * as ReactModule from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InternalAIProvider, useActions, useAIState } from './context';

vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof ReactModule>()),
  use: vi.fn(),
}));

type AIState = {
  a: string;
  b: string;
};

type Controls = {
  actions: Record<string, () => Promise<unknown>>;
  setA: Dispatch<SetStateAction<string>>;
  setB: Dispatch<SetStateAction<string>>;
  state: AIState;
};

const initialAIState: AIState = {
  a: 'initial-a',
  b: 'initial-b',
};

function renderProvider(wrappedActions: Record<string, any> = {}) {
  let controls: Controls | undefined;

  function TestComponent() {
    const [state] = useAIState();
    const [, setA] = useAIState('a');
    const [, setB] = useAIState('b');
    const actions = useActions();

    controls = { actions, setA, setB, state };
    return null;
  }

  const result = render(
    <InternalAIProvider
      initialAIState={initialAIState}
      initialAIStatePatch={undefined}
      initialUIState={{}}
      wrappedActions={wrappedActions}
      wrappedSyncUIState={undefined}
    >
      <TestComponent />
    </InternalAIProvider>,
  );

  return {
    ...result,
    get controls() {
      if (controls === undefined) {
        throw new Error('Test component did not render');
      }
      return controls;
    },
  };
}

describe('useAIState', () => {
  it('preserves same-tick updates to different keys', () => {
    const result = renderProvider();

    act(() => {
      result.controls.setA('updated-a');
      result.controls.setB('updated-b');
    });

    expect(result.controls.state).toEqual({
      a: 'updated-a',
      b: 'updated-b',
    });
  });

  it('preserves sequential updates made by different keyed setters', () => {
    const result = renderProvider();

    act(() => {
      result.controls.setA('updated-a');
    });
    act(() => {
      result.controls.setB('updated-b');
    });

    expect(result.controls.state).toEqual({
      a: 'updated-a',
      b: 'updated-b',
    });
  });
});

describe('wrapped actions', () => {
  it('applies overlapping action deltas to the current AI state', async () => {
    const result = renderProvider({
      actionA: async () => [
        Promise.resolve({ a: ['initial-a', 'updated-a'] }),
        undefined,
      ],
      actionB: async () => [
        Promise.resolve({ b: ['initial-b', 'updated-b'] }),
        undefined,
      ],
    });

    await act(async () => {
      await Promise.all([
        result.controls.actions.actionA(),
        result.controls.actions.actionB(),
      ]);
    });

    expect(result.controls.state).toEqual({
      a: 'updated-a',
      b: 'updated-b',
    });
  });
});
