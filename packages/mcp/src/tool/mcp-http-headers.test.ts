import { describe, expect, it } from 'vitest';
import {
  createMCPToolHeaders,
  encodeMCPHeaderValue,
  getMCPToolHeaderBindings,
} from './mcp-http-headers';

describe('MCP HTTP headers', () => {
  it('extracts statically reachable header bindings', () => {
    expect(
      getMCPToolHeaderBindings({
        type: 'object',
        properties: {
          region: { type: 'string', 'x-mcp-header': 'Region' },
          options: {
            type: 'object',
            properties: {
              dryRun: { type: 'boolean', 'x-mcp-header': 'Dry-Run' },
            },
          },
        },
      }),
    ).toEqual({
      success: true,
      bindings: [
        { headerName: 'Region', path: ['region'], valueType: 'string' },
        {
          headerName: 'Dry-Run',
          path: ['options', 'dryRun'],
          valueType: 'boolean',
        },
      ],
    });
  });

  it.each([
    {
      schema: {
        type: 'object',
        items: { type: 'string', 'x-mcp-header': 'Invalid' },
      },
      error: 'not on a statically reachable property',
    },
    {
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            region: { type: 'string', 'x-mcp-header': 'Region' },
          },
        },
      },
      error: 'not on a statically reachable property',
    },
    {
      schema: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            region: { type: 'string', 'x-mcp-header': 'Region' },
          },
        },
      },
      error: 'not on a statically reachable property',
    },
    {
      schema: {
        type: 'object',
        properties: {
          count: { type: 'number', 'x-mcp-header': 'Count' },
        },
      },
      error: 'can only annotate boolean, integer, or string',
    },
    {
      schema: {
        type: 'object',
        properties: {
          first: { type: 'string', 'x-mcp-header': 'Region' },
          second: { type: 'string', 'x-mcp-header': 'region' },
        },
      },
      error: 'is not unique',
    },
  ])('rejects invalid x-mcp-header schemas', ({ schema, error }) => {
    expect(getMCPToolHeaderBindings(schema)).toMatchObject({
      success: false,
      error: expect.stringContaining(error),
    });
  });

  it('creates encoded headers from tool arguments', () => {
    const result = getMCPToolHeaderBindings({
      type: 'object',
      properties: {
        region: { type: 'string', 'x-mcp-header': 'Region' },
        count: { type: 'integer', 'x-mcp-header': 'Count' },
        options: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', 'x-mcp-header': 'Enabled' },
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }

    expect(
      createMCPToolHeaders({
        bindings: result.bindings,
        args: {
          region: 'Hello, 世界',
          count: 42,
          options: { enabled: false },
        },
      }),
    ).toEqual({
      'Mcp-Param-Region': '=?base64?SGVsbG8sIOS4lueVjA==?=',
      'Mcp-Param-Count': '42',
      'Mcp-Param-Enabled': 'false',
    });
  });

  it.each([
    ['plain-ascii', 'plain-ascii'],
    [' padded ', '=?base64?IHBhZGRlZCA=?='],
    ['=?base64?literal?=', '=?base64?PT9iYXNlNjQ/bGl0ZXJhbD89?='],
  ])('encodes MCP header values safely', (value, expected) => {
    expect(encodeMCPHeaderValue(value)).toBe(expected);
  });
});
