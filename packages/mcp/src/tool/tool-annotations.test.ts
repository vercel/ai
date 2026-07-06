import { describe, expect, it } from 'vitest';
import { getMCPToolAnnotations, isMCPToolCall } from './tool-annotations';

const mcpMetadata = {
  clientName: 'ai-sdk-mcp-client',
  toolName: 'cancel-order',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
};

describe('isMCPToolCall', () => {
  it('returns true for a tool call with MCP toolMetadata', () => {
    expect(isMCPToolCall({ toolMetadata: mcpMetadata })).toBe(true);
  });

  it('returns true for a discovered tool with MCP metadata', () => {
    expect(isMCPToolCall({ metadata: mcpMetadata })).toBe(true);
  });

  it('returns false when metadata lacks the MCP marker', () => {
    expect(isMCPToolCall({ toolMetadata: { foo: 'bar' } })).toBe(false);
  });

  it('returns false when only clientName is present (no toolName)', () => {
    expect(isMCPToolCall({ toolMetadata: { clientName: 'x' } })).toBe(false);
  });

  it('returns false for undefined / null / missing metadata', () => {
    expect(isMCPToolCall(undefined)).toBe(false);
    expect(isMCPToolCall(null)).toBe(false);
    expect(isMCPToolCall({})).toBe(false);
    expect(isMCPToolCall({ toolMetadata: undefined })).toBe(false);
  });
});

describe('getMCPToolAnnotations', () => {
  it('returns the hints for an MCP tool call that carries them', () => {
    expect(getMCPToolAnnotations({ toolMetadata: mcpMetadata })).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('reads from a discovered tool metadata as well', () => {
    expect(getMCPToolAnnotations({ metadata: mcpMetadata })).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('returns undefined for an MCP tool with no annotations', () => {
    expect(
      getMCPToolAnnotations({
        toolMetadata: {
          clientName: 'ai-sdk-mcp-client',
          toolName: 'read-order',
        },
      }),
    ).toBeUndefined();
  });

  it('returns undefined for a non-MCP tool call', () => {
    expect(
      getMCPToolAnnotations({ toolMetadata: { foo: 'bar' } }),
    ).toBeUndefined();
  });

  it('returns undefined for missing metadata', () => {
    expect(getMCPToolAnnotations(undefined)).toBeUndefined();
    expect(getMCPToolAnnotations({})).toBeUndefined();
  });
});
