import { createRequire } from 'node:module';
import * as nodeModule from 'node:module';

type ResolveResult = {
  shortCircuit?: boolean;
  url: string;
};

const registerHooks = (
  nodeModule as unknown as {
    registerHooks(hooks: {
      resolve: (
        specifier: string,
        context: unknown,
        nextResolve: (specifier: string, context: unknown) => ResolveResult,
      ) => ResolveResult;
    }): unknown;
  }
).registerHooks;

const workspaceRoot = new URL('../../../../', import.meta.url);
const reactUrl = new URL(
  'packages/devtools/node_modules/react/index.js',
  workspaceRoot,
).href;
const reactDomClientUrl = new URL(
  'packages/devtools/node_modules/react-dom/client.js',
  workspaceRoot,
).href;

// The RSC package supports React 19, but its local test dependency is React 18.
// Resolve the source under test and the harness to the installed React 19 copy.
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

type AIState = {
  a: string;
  b: string;
};

type ProbeApi = {
  getState: () => AIState;
  setA: (value: string | ((previous: string) => string)) => void;
  setB: (value: string | ((previous: string) => string)) => void;
  actions: Record<string, () => Promise<unknown>>;
};

type Scenario = {
  name: string;
  expected: AIState;
  reportedBuggy: AIState;
  observed: AIState;
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function statesEqual(left: AIState, right: AIState) {
  return left.a === right.a && left.b === right.b;
}

async function main() {
  const rscRequire = createRequire(
    new URL('packages/rsc/package.json', workspaceRoot),
  );
  const { JSDOM } = rscRequire('jsdom');
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    {
      pretendToBeVisual: true,
      url: 'http://localhost/',
    },
  );

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  });

  const ReactModule = await import(reactUrl);
  const React = ReactModule.default;
  const { act } = ReactModule;
  const { createRoot } = await import(reactDomClientUrl);
  const { InternalAIProvider, useActions, useAIState } = await import(
    new URL('packages/rsc/src/shared-client/context.tsx', workspaceRoot).href
  );

  async function mount(
    wrappedActions: Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    > = {},
  ) {
    let current: ProbeApi | undefined;

    function Probe() {
      const [a, setA] = useAIState('a');
      const [b, setB] = useAIState('b');
      const actions = useActions();
      current = {
        actions,
        getState: () => ({ a, b }),
        setA,
        setB,
      };
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
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
      api: () => {
        if (current === undefined) {
          throw new Error('Probe did not render.');
        }
        return current;
      },
      cleanup: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  }

  const scenarios: Scenario[] = [];

  {
    const harness = await mount();
    try {
      await act(async () => {
        harness.api().setA('x');
        harness.api().setB('y');
      });
      scenarios.push({
        name: 'same-tick keyed setters',
        expected: { a: 'x', b: 'y' },
        reportedBuggy: { a: 'init-a', b: 'y' },
        observed: harness.api().getState(),
      });
    } finally {
      await harness.cleanup();
    }
  }

  {
    const harness = await mount();
    try {
      await act(async () => {
        harness.api().setA('x2');
      });
      await act(async () => {
        harness.api().setB('y2');
      });
      scenarios.push({
        name: 'sequential keyed setters',
        expected: { a: 'x2', b: 'y2' },
        reportedBuggy: { a: 'init-a', b: 'y2' },
        observed: harness.api().getState(),
      });
    } finally {
      await harness.cleanup();
    }
  }

  {
    const harness = await mount();
    try {
      await act(async () => {
        harness.api().setA(previous => `${previous}-fn`);
        harness.api().setB(previous => `${previous}-fn`);
      });
      const functionalState = harness.api().getState();
      const expectedFunctionalState = {
        a: 'init-a-fn',
        b: 'init-b-fn',
      };
      if (!statesEqual(functionalState, expectedFunctionalState)) {
        throw new Error(
          `Functional-updater control failed: ${JSON.stringify(functionalState)}`,
        );
      }
    } finally {
      await harness.cleanup();
    }
  }

  {
    const actionADelta = createDeferred<unknown>();
    const actionBDelta = createDeferred<unknown>();
    const harness = await mount({
      actionA: async () => [actionADelta.promise, undefined],
      actionB: async () => [actionBDelta.promise, undefined],
    });

    try {
      await act(async () => {
        await Promise.all([
          harness.api().actions.actionA(),
          harness.api().actions.actionB(),
        ]);
      });
      await act(async () => {
        actionADelta.resolve({ a: ['init-a', 'from-A'] });
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      await act(async () => {
        actionBDelta.resolve({ b: ['init-b', 'from-B'] });
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      scenarios.push({
        name: 'overlapping wrapped actions',
        expected: { a: 'from-A', b: 'from-B' },
        reportedBuggy: { a: 'init-a', b: 'from-B' },
        observed: harness.api().getState(),
      });
    } finally {
      await harness.cleanup();
    }
  }

  {
    const actionDelta = createDeferred<unknown>();
    const harness = await mount({
      actionB: async () => [actionDelta.promise, undefined],
    });

    try {
      await act(async () => {
        await harness.api().actions.actionB();
      });
      await act(async () => {
        harness.api().setA(() => 'from-local');
      });
      await act(async () => {
        actionDelta.resolve({ b: ['init-b', 'from-B'] });
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      scenarios.push({
        name: 'wrapped action racing a functional local setter',
        expected: { a: 'from-local', b: 'from-B' },
        reportedBuggy: { a: 'init-a', b: 'from-B' },
        observed: harness.api().getState(),
      });
    } finally {
      await harness.cleanup();
    }
  }

  for (const scenario of scenarios) {
    console.log(
      `${scenario.name}: observed=${JSON.stringify(scenario.observed)} expected=${JSON.stringify(scenario.expected)}`,
    );
    if (
      !statesEqual(scenario.observed, scenario.expected) &&
      !statesEqual(scenario.observed, scenario.reportedBuggy)
    ) {
      throw new Error(
        `Unexpected state for ${scenario.name}: ${JSON.stringify(scenario.observed)}`,
      );
    }
  }

  const reproduced = scenarios.filter(scenario =>
    statesEqual(scenario.observed, scenario.reportedBuggy),
  );
  if (reproduced.length > 0) {
    throw new Error(
      `ISSUE_19241_REPRODUCED: AI state updates were dropped in ${reproduced.map(scenario => scenario.name).join(', ')}`,
    );
  }

  console.log('All keyed and wrapped-action AI state updates were preserved.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
