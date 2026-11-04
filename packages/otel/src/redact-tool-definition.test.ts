import { describe, expect, it } from 'vitest';
import { redactToolDefinition } from './redact-tool-definition';

describe('redactToolDefinition', () => {
  it.each([
    undefined,
    null,
    {},
    { container: 'cntr_existing' },
    { container: {} },
    { container: { networkPolicy: { type: 'disabled' } } },
    { container: { networkPolicy: { type: 'allowlist', domainSecrets: [] } } },
  ])('preserves definitions without domain secrets: %j', args => {
    const tool = { type: 'provider', id: 'openai.code_interpreter', args };
    expect(redactToolDefinition(tool)).toEqual(tool);
  });

  it('preserves unrelated tool definitions', () => {
    const args = {
      container: {
        networkPolicy: { domainSecrets: [{ value: 'ordinary-input' }] },
      },
    };
    for (const tool of [
      { type: 'function', name: 'code_interpreter', args },
      { type: 'provider', id: 'other.tool', args },
    ]) {
      expect(redactToolDefinition(tool)).toBe(tool);
    }
  });

  it('redacts multiple credentials without mutating provider arguments', () => {
    const tool = {
      type: 'provider',
      id: 'openai.code_interpreter',
      name: 'renamed_python',
      args: {
        container: {
          fileIds: ['file-123'],
          memoryLimit: '4g',
          networkPolicy: {
            type: 'allowlist',
            allowedDomains: ['example.com'],
            domainSecrets: [
              { domain: 'example.com', name: 'API_KEY', value: 'private-key' },
              { domain: 'example.com', name: 'TOKEN', value: 'private-token' },
            ],
          },
        },
      },
    };
    const original = structuredClone(tool);
    const result = redactToolDefinition(tool);
    expect(result).toEqual({
      type: 'provider',
      id: 'openai.code_interpreter',
      name: 'renamed_python',
      args: {
        container: {
          fileIds: ['file-123'],
          memoryLimit: '4g',
          networkPolicy: {
            type: 'allowlist',
            allowedDomains: ['example.com'],
            domainSecrets: [
              { domain: 'example.com', name: 'API_KEY', value: '[redacted]' },
              { domain: 'example.com', name: 'TOKEN', value: '[redacted]' },
            ],
          },
        },
      },
    });
    expect(tool).toEqual(original);
  });
});
