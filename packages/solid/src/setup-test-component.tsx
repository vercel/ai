import { cleanup, render } from '@solidjs/testing-library';
import { Store, SwrProvider } from 'solid-swr';
import { JSX, Component } from 'solid-js';

export const setupTestComponent = (
  TestComponent: Component<any>,
  {
    init,
  }: {
    init?: (TestComponent: Component<any>) => JSX.Element;
  } = {},
) => {
  beforeEach(() => {
    // reset SWR cache to isolate tests:
    render(() => (
      <SwrProvider value={{ store: new Store() }}>
        {init?.(TestComponent) ?? <TestComponent />}
      </SwrProvider>
    ));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });
};
