import { describe, expectTypeOf, it } from 'vitest';
import { mcp } from './mcp';

describe('mcp tool type', () => {
  it('accepts exactly one MCP server target', () => {
    expectTypeOf(
      mcp({ serverLabel: 'remote', serverUrl: 'https://example.com/mcp' }),
    ).not.toBeNever();
    expectTypeOf(
      mcp({ serverLabel: 'connector', connectorId: 'connector_example' }),
    ).not.toBeNever();
    expectTypeOf(
      mcp({
        serverLabel: 'secure-tunnel',
        tunnelId: 'tunnel_0123456789abcdef0123456789abcdef',
      }),
    ).not.toBeNever();

    // @ts-expect-error an MCP target is required
    mcp({ serverLabel: 'missing-target' });

    // @ts-expect-error MCP targets are mutually exclusive
    mcp({
      serverLabel: 'ambiguous-target',
      serverUrl: 'https://example.com/mcp',
      tunnelId: 'tunnel_0123456789abcdef0123456789abcdef',
    });
  });
});
