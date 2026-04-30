import type { InferSchema, ProviderDefinedTool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import {
  localShell,
  type localShellInputSchema,
  type localShellOutputSchema,
} from './local-shell';

describe('local-shell tool type', () => {
  it('should have Tool type', () => {
    const localShellTool = localShell({});

    expectTypeOf(localShellTool).toEqualTypeOf<
      ProviderDefinedTool<
        InferSchema<typeof localShellInputSchema>,
        InferSchema<typeof localShellOutputSchema>,
        {}
      >
    >();
  });
});
