import {
  formatAssistantStreamPart,
  parseAssistantStreamPart,
} from './assistant-stream-parts';

describe('text stream part', () => {
  it('should format a text stream part', () => {
    expect(formatAssistantStreamPart('text', 'value\nvalue')).toEqual(
      '0:"value\\nvalue"\n',
    );
  });

  it('should parse a text line', () => {
    const input = '0:"Hello, world!"';
    expect(parseAssistantStreamPart(input)).toEqual({
      type: 'text',
      value: 'Hello, world!',
    });
  });
});
