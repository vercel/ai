import { describe, expect, it } from 'vitest';
import { MCPClientError } from './index';

describe('MCPClientError export', () => {
  it('should expose HTTP error metadata through the package entry point', () => {
    const error = new MCPClientError({
      message: 'MCP request failed',
      code: -32000,
      statusCode: 503,
      url: 'https://example.com/mcp',
      responseBody: 'Service Unavailable',
    });

    expect(MCPClientError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      code: -32000,
      statusCode: 503,
      url: 'https://example.com/mcp',
      responseBody: 'Service Unavailable',
    });
  });
});
