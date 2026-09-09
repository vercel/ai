import { describe, expect, it } from 'vitest';
import { createClaudeCodeSystemPrompt } from './claude-code-system-prompt';

describe('createClaudeCodeSystemPrompt', () => {
  it('uses the full Claude Code preset without instructions', () => {
    expect(createClaudeCodeSystemPrompt()).toMatchInlineSnapshot(`
      {
        "preset": "claude_code",
        "type": "preset",
      }
    `);
  });

  it('appends instructions to the full Claude Code preset', () => {
    expect(createClaudeCodeSystemPrompt('Answer every question in German.'))
      .toMatchInlineSnapshot(`
      {
        "append": "Answer every question in German.",
        "preset": "claude_code",
        "type": "preset",
      }
    `);
  });
});
