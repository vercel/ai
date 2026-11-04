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
