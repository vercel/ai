import { describe, expect, it } from 'vitest';
import { fromAnthropicHeaders } from './from-anthropic-headers';

describe('fromAnthropicHeaders', () => {
  it('should support multiple anthropic beta headers', () => {
    const headers = fromAnthropicHeaders({
      'anthropic-beta': ['skills-2025-10-02', 'files-api-2025-02-19'],
    });
    expect(headers).toEqual({
      'anthropic-beta': 'skills-2025-10-02,files-api-2025-02-19',
    });
  });

  it('should support a single anthropic beta header', () => {
    const headers = fromAnthropicHeaders({
      'anthropic-beta': 'skills-2025-10-02',
    });
    expect(headers).toEqual({
      'anthropic-beta': 'skills-2025-10-02',
    });
  });
});
