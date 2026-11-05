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
  azure.tools.customTool({
    format: { type: 'grammar', syntax: 'regex', definition: 'SELECT .+' },
    execute: async input => {
      expectTypeOf(input).toEqualTypeOf<string>();
      return input;
    },
  }),
).not.toBeNever();

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

expectTypeOf(
  azure.tools.shell({
    execute: async ({ action }) => {
      expectTypeOf(action.commands).toEqualTypeOf<string[]>();
      expectTypeOf(action.timeoutMs).toEqualTypeOf<number | undefined>();
      expectTypeOf(action.maxOutputLength).toEqualTypeOf<number | undefined>();
      return {
        output: [
          { stdout: '', stderr: '', outcome: { type: 'exit', exitCode: 0 } },
        ],
      };
    },
  }),
).not.toBeNever();

expectTypeOf(
  azure.tools.shell({
    environment: {
      type: 'containerAuto',
      skills: [
        {
          type: 'inline',
          name: 'test',
          description: 'Test',
          source: { type: 'base64', mediaType: 'application/zip', data: '' },
        },
      ],
    },
  }),
).not.toBeNever();
