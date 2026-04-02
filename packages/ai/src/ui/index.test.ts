import { describe, expect, it } from 'vitest';

import { isDynamicToolUIPart } from './index';

describe('ui public exports', () => {
  it('exports isDynamicToolUIPart', () => {
    expect(
      isDynamicToolUIPart({
        type: 'dynamic-tool',
        toolName: 'search',
        toolCallId: 'tool-call-1',
        state: 'input-available',
        input: { query: 'weather' },
      }),
    ).toBe(true);

    expect(
      isDynamicToolUIPart({
        type: 'text',
        text: 'hello',
      }),
    ).toBe(false);
  });
});
