import { describe, expect, it } from 'vitest';
import { prepareToolChoice } from './prepare-tool-choice';

describe('prepareToolChoice', () => {
  it('returns auto when tool choice is not provided', () => {
    const result = prepareToolChoice({
      toolChoice: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "type": "auto",
      }
    `);
  });

  it('handles string tool choice: none', () => {
    const result = prepareToolChoice({
      toolChoice: 'none',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "type": "none",
      }
    `);
  });

  it('handles object tool choice', () => {
    const result = prepareToolChoice({
      toolChoice: { type: 'tool', toolName: 'tool2' },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolName": "tool2",
        "type": "tool",
      }
    `);
  });

  it('handles string tool choice: auto', () => {
    const result = prepareToolChoice({
      toolChoice: 'auto',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "type": "auto",
      }
    `);
  });

  it('handles string tool choice: required', () => {
    const result = prepareToolChoice({
      toolChoice: 'required',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "type": "required",
      }
    `);
  });

  it('handles allowedTools with default mode', () => {
    const result = prepareToolChoice({
      toolChoice: {
        type: 'allowedTools',
        toolNames: ['tool1', 'tool2'],
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolNames": [
          "tool1",
          "tool2",
        ],
        "type": "allowedTools",
      }
    `);
  });

  it('handles allowedTools with explicit required mode', () => {
    const result = prepareToolChoice({
      toolChoice: {
        type: 'allowedTools',
        toolNames: ['tool1'],
        mode: 'required',
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "mode": "required",
        "toolNames": [
          "tool1",
        ],
        "type": "allowedTools",
      }
    `);
  });
});
