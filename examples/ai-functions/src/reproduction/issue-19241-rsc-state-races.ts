import { createRequire, registerHooks } from 'node:module';

const reactUrl = new URL(
  '../../../../node_modules/.pnpm/react@19.2.4/node_modules/react/index.js',
  import.meta.url,
).href;
const reactDomClientUrl = new URL(
  '../../../../node_modules/.pnpm/react-dom@19.2.4_react@19.2.4/node_modules/react-dom/client.js',
  import.meta.url,
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react') {
      return { shortCircuit: true, url: reactUrl };
    }
    if (specifier === 'react-dom/client') {
      return { shortCircuit: true, url: reactDomClientUrl };
    }
    return nextResolve(specifier, context);
  },
});

const requireFromRsc = createRequire(
  new URL('../../../../packages/rsc/package.json', import.meta.url),
);
const { JSDOM } = requireFromRsc('jsdom');

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  },
);

Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { InternalAIProvider, useActions, useAIState } =
  await import('../../../../packages/rsc/src/shared-client/context.tsx');

type State = { a: string; b: string };
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function sameState(actual: State, expected: State) {
  return actual.a === expected.a && actual.b === expected.b;
}

function printState(label: string, state: State) {
  console.log(`${label}: ${JSON.stringify(state)}`);
}

async function flushDetachedUpdate() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function mount(wrappedActions: Record<string, unknown> = {}) {
  const container = document.createElement('div');
  document.body.append(container);

  let captured: any;

  function Probe() {
    const [state] = useAIState();
    const [, setA] = useAIState('a');
    const [, setB] = useAIState('b');
    const actions = useActions();
    captured = {
      actions,
      getState: () => state as State,
      setA,
      setB,
    };
    return null;
  }

  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        InternalAIProvider,
        {
          initialAIState: { a: 'init-a', b: 'init-b' },
          initialAIStatePatch: undefined,
          initialUIState: {},
          wrappedActions,
          wrappedSyncUIState: undefined,
        },
        React.createElement(Probe),
      ),
    );
  });

  return {
    get captured() {
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

async function testKeyedSetters() {
  const failures: string[] = [];

  const sameTick = await mount();
  await act(async () => {
    sameTick.captured.setA('x');
    sameTick.captured.setB('y');
  });
  const sameTickState = sameTick.captured.getState();
  printState('same-tick keyed setters', sameTickState);
  if (!sameState(sameTickState, { a: 'x', b: 'y' })) {
    failures.push('same-tick keyed setters dropped the a update');
  }
  await sameTick.unmount();

  const sequential = await mount();
  await act(async () => {
    sequential.captured.setA('x2');
  });
  await act(async () => {
    sequential.captured.setB('y2');
  });
  const sequentialState = sequential.captured.getState();
  printState('sequential keyed setters', sequentialState);
  if (!sameState(sequentialState, { a: 'x2', b: 'y2' })) {
    failures.push('sequential keyed setters dropped the a update');
  }
  await sequential.unmount();

  const functional = await mount();
  await act(async () => {
    functional.captured.setA((previous: string) => `${previous}-fn`);
  });
  await act(async () => {
    functional.captured.setB((previous: string) => `${previous}-fn`);
  });
  const functionalState = functional.captured.getState();
  printState('functional keyed setters', functionalState);
  await functional.unmount();
  if (
    !sameState(functionalState, {
      a: 'init-a-fn',
      b: 'init-b-fn',
    })
  ) {
    throw new Error(
      `CONTROL_FAILURE: functional keyed setters produced ${JSON.stringify(functionalState)}`,
    );
  }

  return failures;
}

async function testOverlappingActions() {
  const deltaA = deferred<unknown>();
  const deltaB = deferred<unknown>();
  const snapshots: State[] = [];
  const mounted = await mount({
    actionA: async (snapshot: State) => {
      snapshots.push(snapshot);
      return [deltaA.promise, 'A'];
    },
    actionB: async (snapshot: State) => {
      snapshots.push(snapshot);
      return [deltaB.promise, 'B'];
    },
  });

  await act(async () => {
    await Promise.all([
      mounted.captured.actions.actionA(),
      mounted.captured.actions.actionB(),
    ]);
  });
  await act(async () => {
    deltaA.resolve({ a: ['init-a', 'from-A'] });
    await flushDetachedUpdate();
  });
  await act(async () => {
    deltaB.resolve({ b: ['init-b', 'from-B'] });
    await flushDetachedUpdate();
  });

  const state = mounted.captured.getState();
  printState('overlapping wrapped actions', state);
  console.log(`overlapping action snapshots: ${JSON.stringify(snapshots)}`);
  await mounted.unmount();

  return sameState(state, { a: 'from-A', b: 'from-B' })
    ? []
    : ['overlapping wrapped actions dropped the action A update'];
}

async function testActionSetterRace() {
  const deltaB = deferred<unknown>();
  const snapshots: State[] = [];
  const mounted = await mount({
    actionB: async (snapshot: State) => {
      snapshots.push(snapshot);
      return [deltaB.promise, 'B'];
    },
  });

  await act(async () => {
    await mounted.captured.actions.actionB();
  });
  await act(async () => {
    mounted.captured.setA(() => 'from-local');
  });
  await act(async () => {
    deltaB.resolve({ b: ['init-b', 'from-B'] });
    await flushDetachedUpdate();
  });

  const state = mounted.captured.getState();
  printState('wrapped action racing a functional keyed setter', state);
  console.log(`action/setter race snapshot: ${JSON.stringify(snapshots)}`);
  await mounted.unmount();

  return sameState(state, { a: 'from-local', b: 'from-B' })
    ? []
    : ['a wrapped action dropped the functional local a update'];
}

async function main() {
  const failures = [
    ...(await testKeyedSetters()),
    ...(await testOverlappingActions()),
    ...(await testActionSetterRace()),
  ];

  if (failures.length > 0) {
    console.error(`ISSUE_19241_PRIMARY_FAILURE: ${failures.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log('Issue #19241 is not present.');
  }
}

await main();
