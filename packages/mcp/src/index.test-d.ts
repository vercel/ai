import { expectTypeOf, it } from 'vitest';
import { MCPClientError } from './index';

it('narrows unknown errors and exposes optional MCP error metadata', () => {
  const error: unknown = new MCPClientError({
    message: 'MCP request failed',
  });

  if (MCPClientError.isInstance(error)) {
    expectTypeOf(error).toEqualTypeOf<MCPClientError>();
    expectTypeOf(error.code).toEqualTypeOf<number | undefined>();
    expectTypeOf(error.statusCode).toEqualTypeOf<number | undefined>();
    expectTypeOf(error.url).toEqualTypeOf<string | undefined>();
    expectTypeOf(error.responseBody).toEqualTypeOf<string | undefined>();
  }
});
