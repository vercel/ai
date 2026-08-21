import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

type AIState = {
  a: string;
  b: string;
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

type Captured = {
  getState: () => AIState;
  setA: (value: string | ((current: string) => string)) => void;
  setB: (value: string | ((current: string) => string)) => void;
  setState: (value: AIState | ((current: AIState) => AIState)) => void;
  actions: Record<string, () => Promise<unknown>>;
};

const initialState: AIState = { a: 'init-a', b: 'init-b' };

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function main() {
  const reactUrl = new URL(
    '../../../../node_modules/.pnpm/react@19.2.6/node_modules/react/index.js',
    import.meta.url,
  ).href;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'react') {
        return { shortCircuit: true, url: reactUrl };
      }
      return nextResolve(specifier, context);
    },
  });

  const importModule = (specifier: string): Promise<any> => import(specifier);
  const [{ JSDOM }, React, { act }, { createRoot }, rsc] = await Promise.all([
    importModule('../../../../packages/rsc/node_modules/jsdom/lib/api.js'),
    importModule('react'),
    importModule('react'),
    importModule(
      '../../../../node_modules/.pnpm/react-dom@19.2.6_react@19.2.6/node_modules/react-dom/client.js',
    ),
    importModule('../../../../packages/rsc/src/shared-client/context.tsx'),
  ]);

  const { InternalAIProvider, useActions, useAIState } = rsc;
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    {
      pretendToBeVisual: true,
      url: 'http://localhost/',
    },
  );

  Object.assign(globalThis, {
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    window: dom.window,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  });

  async function mount(wrappedActions: Record<string, any> = {}) {
    let captured: Captured | undefined;

    function Probe() {
      const [state, setState] = useAIState();
      const [, setA] = useAIState('a');
      const [, setB] = useAIState('b');
      const actions = useActions();
      captured = {
        actions,
        getState: () => state,
        setA,
        setB,
        setState,
      };
      return null;
    }

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          InternalAIProvider,
          {
            initialAIState: initialState,
            initialAIStatePatch: undefined,
            initialUIState: {},
            wrappedActions,
            wrappedSyncUIState: undefined,
          },
          React.createElement(Probe),
        ),
      );
    });

    assert.ok(captured, 'Probe did not render');

    return {
      get captured() {
        assert.ok(captured, 'Probe is not mounted');
        return captured;
      },
      async unmount() {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      },
    };
  }

  const failures: string[] = [];

  {
    const harness = await mount();
    await act(async () => {
      harness.captured.setA('x');
      harness.captured.setB('y');
    });
    const actual = harness.captured.getState();
    try {
      assert.deepEqual(actual, { a: 'x', b: 'y' });
    } catch {
      failures.push(
        `same-tick keyed setters expected {"a":"x","b":"y"}, received ${JSON.stringify(actual)}`,
      );
    }
    await harness.unmount();
  }

  {
    const harness = await mount();
    await act(async () => {
      harness.captured.setA('x2');
    });
    await act(async () => {
      harness.captured.setB('y2');
    });
    const actual = harness.captured.getState();
    try {
      assert.deepEqual(actual, { a: 'x2', b: 'y2' });
    } catch {
      failures.push(
        `sequential keyed setters expected {"a":"x2","b":"y2"}, received ${JSON.stringify(actual)}`,
      );
    }

    const beforeFunctionalUpdates = harness.captured.getState();
    await act(async () => {
      harness.captured.setA(current => `${current}-fn`);
    });
    await act(async () => {
      harness.captured.setB(current => `${current}-fn`);
    });
    assert.deepEqual(harness.captured.getState(), {
      a: `${beforeFunctionalUpdates.a}-fn`,
      b: `${beforeFunctionalUpdates.b}-fn`,
    });
    await harness.unmount();
  }

  {
    const actionA = deferred();
    const actionB = deferred();
    const harness = await mount({
      actionA: async () => {
        await actionA.promise;
        return [Promise.resolve({ a: ['init-a', 'from-A'] }), 'A'];
      },
      actionB: async () => {
        await actionB.promise;
        return [Promise.resolve({ b: ['init-b', 'from-B'] }), 'B'];
      },
    });

    const promiseA = harness.captured.actions.actionA();
    const promiseB = harness.captured.actions.actionB();

    await act(async () => {
      actionA.resolve();
      await promiseA;
      await Promise.resolve();
    });
    await act(async () => {
      actionB.resolve();
      await promiseB;
      await Promise.resolve();
    });

    const actual = harness.captured.getState();
    try {
      assert.deepEqual(actual, { a: 'from-A', b: 'from-B' });
    } catch {
      failures.push(
        `overlapping wrapped actions expected {"a":"from-A","b":"from-B"}, received ${JSON.stringify(actual)}`,
      );
    }
    await harness.unmount();
  }

  {
    const actionB = deferred();
    const harness = await mount({
      actionB: async () => {
        await actionB.promise;
        return [Promise.resolve({ b: ['init-b', 'from-B'] }), 'B'];
      },
    });

    const promiseB = harness.captured.actions.actionB();
    await act(async () => {
      harness.captured.setState(current => ({
        ...current,
        a: 'from-local-setter',
      }));
    });
    await act(async () => {
      actionB.resolve();
      await promiseB;
      await Promise.resolve();
    });

    const actual = harness.captured.getState();
    try {
      assert.deepEqual(actual, {
        a: 'from-local-setter',
        b: 'from-B',
      });
    } catch {
      failures.push(
        `wrapped action versus local setter expected {"a":"from-local-setter","b":"from-B"}, received ${JSON.stringify(actual)}`,
      );
    }
    await harness.unmount();
  }

  dom.window.close();

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_19241_REPRODUCED: AI state updates were dropped\n${failures.join('\n')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
