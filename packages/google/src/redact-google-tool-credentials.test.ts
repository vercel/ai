import { redactTelemetryValue } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import {
  redactGoogleToolArgs,
  withGoogleInteractionsRequestRedaction,
} from './redact-google-tool-credentials';

describe('redactGoogleToolArgs', () => {
  it('redacts every header value without mutating provider arguments', () => {
    const args = {
      name: 'local-mcp',
      url: 'https://example.com/mcp',
      headers: {
        Authorization: 'Bearer mcp-private-token',
        'X-Custom-Key': 'mcp-private-key',
      },
      allowedTools: ['getWeather'],
    };
    const original = structuredClone(args);

    expect(redactGoogleToolArgs('google.mcp_server', args)).toEqual({
      ...args,
      headers: { Authorization: '[redacted]', 'X-Custom-Key': '[redacted]' },
    });
    expect(args).toEqual(original);
  });

  it.each([
    ['google.mcp_server', { url: 'https://example.com/mcp' }],
    ['google.mcp_server', { headers: null }],
    ['google.google_search', { headers: { Authorization: 'Bearer token' } }],
    ['other.tool', { headers: { Authorization: 'Bearer token' } }],
  ])('preserves %s definitions without MCP server headers', (id, args) => {
    expect(redactGoogleToolArgs(id, args)).toBe(args);
  });
});

describe('withGoogleInteractionsRequestRedaction', () => {
  it('provides a redacted telemetry view of MCP server request headers', () => {
    const body = {
      model: 'gemini-2.5-flash',
      input: [{ type: 'user_input', content: [] }],
      tools: [
        {
          type: 'mcp_server',
          name: 'local-mcp',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer mcp-private-token',
            'X-Custom-Key': 'mcp-private-key',
          },
          allowed_tools: ['getWeather'],
        },
        { type: 'google_search' },
      ],
    };
    const original = structuredClone(body);
    const value = withGoogleInteractionsRequestRedaction(body);

    // The request keeps the credentials; only the telemetry view is redacted.
    expect(JSON.stringify(value)).toContain('mcp-private-token');
    expect(redactTelemetryValue(value)).toEqual({
      ...body,
      tools: [
        {
          type: 'mcp_server',
          name: 'local-mcp',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: '[redacted]',
            'X-Custom-Key': '[redacted]',
          },
          allowed_tools: ['getWeather'],
        },
        { type: 'google_search' },
      ],
    });
    expect(body).toEqual(original);
  });

  it.each([
    {},
    { input: [] },
    { tools: [{ type: 'google_search' }] },
    { tools: [{ type: 'mcp_server', url: 'https://example.com/mcp' }] },
  ])('preserves bodies without MCP server credentials: %j', body => {
    expect(withGoogleInteractionsRequestRedaction(body)).toBe(body);
  });
});
