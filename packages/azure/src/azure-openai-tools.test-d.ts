import { expectTypeOf } from 'vitest';
import { azure } from './azure-openai-provider';

expectTypeOf(
  azure.tools.webSearch({
    filters: {
      blockedDomains: ['example.com'],
    },
  }),
).not.toBeNever();
