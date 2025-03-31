import { cleanup, render } from '@testing-library/react';

export const setupTestComponent = (
  TestComponent: React.ComponentType<any>,
  {
    init,
  }: {
    init?: (TestComponent: React.ComponentType<any>) => React.ReactNode;
  } = {},
) => {
  beforeEach(() => {
    render(init?.(TestComponent) ?? <TestComponent />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });
};
