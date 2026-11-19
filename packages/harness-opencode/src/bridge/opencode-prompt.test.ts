import { describe, expect, it } from 'vitest';
import { toOpenCodePromptParts } from './opencode-prompt';

describe('OpenCode prompt parts', () => {
  it('converts string prompts to text parts', () => {
    expect(toOpenCodePromptParts('Describe this image.')).toEqual([
      { type: 'text', text: 'Describe this image.' },
    ]);
  });

  it('converts text and image content to OpenCode parts', () => {
    expect(
      toOpenCodePromptParts([
        { type: 'text', text: 'Describe this image.' },
        { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
      ]),
    ).toEqual([
      { type: 'text', text: 'Describe this image.' },
      {
        type: 'file',
        mime: 'image/png',
        url: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);
  });
});
