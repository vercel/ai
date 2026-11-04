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
