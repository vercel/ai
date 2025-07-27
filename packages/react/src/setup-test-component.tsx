import { cleanup, render } from '@testing-library/react';
import { SWRConfig } from 'swr';

export const setupTestComponent = (
  TestComponent: React.ComponentType<any>,
  {
    init,
  }: {
    init?: (TestComponent: React.ComponentType<any>) => React.ReactNode;
  } = {},
) => {
  beforeEach(() => {
    // reset SWR cache to isolate tests:
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        {init?.(TestComponent) ?? <TestComponent />}
      </SWRConfig>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });
};
