import { expectTypeOf } from 'vitest';
import { azure } from './azure-openai-provider';

expectTypeOf(
  azure.tools.webSearch({
    filters: {
      blockedDomains: ['example.com'],
    },
  }),
).not.toBeNever();

expectTypeOf(azure.tools.toolSearch()).not.toBeNever();

expectTypeOf(
  azure.tools.applyPatch({
    execute: async ({ callId, operation }) => {
      expectTypeOf(callId).toEqualTypeOf<string>();
      expectTypeOf(operation.path).toEqualTypeOf<string>();
      expectTypeOf(operation.type).toEqualTypeOf<
        'create_file' | 'update_file' | 'delete_file'
      >();
      if (operation.type !== 'delete_file') {
        expectTypeOf(operation.diff).toEqualTypeOf<string>();
      }
      return { status: 'completed', output: 'Applied patch' };
    },
  }),
).not.toBeNever();
