import { describe, it, expect } from 'vitest';
import {
  getToolName,
  isDataUIPart,
  getTextParts,
  getTextContent,
  getReasoningParts,
  getReasoningContent,
  isReasoningStreaming,
  isTextStreaming,
  UIMessage,
} from './ui-messages';

describe('getToolName', () => {
  it('should return the tool name after the "tool-" prefix', () => {
    expect(
      getToolName({
        type: 'tool-getLocation',
        toolCallId: 'tool1',
        state: 'output-available',
        input: {},
        output: 'some result',
      }),
    ).toBe('getLocation');
  });

  it('should return the tool name for tools that contains a dash', () => {
    expect(
      getToolName({
        type: 'tool-get-location',
        toolCallId: 'tool1',
        state: 'output-available',
        input: {},
        output: 'some result',
      }),
    ).toBe('get-location');
  });
});

describe('isDataUIPart', () => {
  it('should return true if the part is a data part', () => {
    expect(
      isDataUIPart({
        type: 'data-someDataPart',
        data: 'some data',
      }),
    ).toBe(true);
  });

  it('should return false if the part is not a data part', () => {
    expect(
      isDataUIPart({
        type: 'text',
        text: 'some text',
      }),
    ).toBe(false);
  });
});

// helper to create test messages
const createMessage = (parts: UIMessage['parts']): UIMessage => ({
  id: 'test-id',
  role: 'assistant',
  parts,
});

describe('getTextParts', () => {
  it('should return all text parts', () => {
    const message = createMessage([
      { type: 'text', text: 'Hello' },
      { type: 'reasoning', text: 'thinking...' },
      { type: 'text', text: 'World' },
    ]);

    const result = getTextParts(message);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Hello');
    expect(result[1].text).toBe('World');
  });

  it('should return empty array when no text parts', () => {
    const message = createMessage([{ type: 'reasoning', text: 'thinking...' }]);

    expect(getTextParts(message)).toHaveLength(0);
  });
});

describe('getTextContent', () => {
  it('should join all text parts', () => {
    const message = createMessage([
      { type: 'text', text: 'Hello ' },
      { type: 'reasoning', text: 'thinking...' },
      { type: 'text', text: 'World' },
    ]);

    expect(getTextContent(message)).toBe('Hello World');
  });

  it('should return empty string when no text parts', () => {
    const message = createMessage([{ type: 'reasoning', text: 'thinking...' }]);

    expect(getTextContent(message)).toBe('');
  });
});

describe('getReasoningParts', () => {
  it('should return all reasoning parts', () => {
    const message = createMessage([
      { type: 'reasoning', text: 'first thought' },
      { type: 'text', text: 'Hello' },
      { type: 'reasoning', text: 'second thought' },
    ]);

    const result = getReasoningParts(message);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('first thought');
    expect(result[1].text).toBe('second thought');
  });

  it('should return empty array when no reasoning parts', () => {
    const message = createMessage([{ type: 'text', text: 'Hello' }]);

    expect(getReasoningParts(message)).toHaveLength(0);
  });
});

describe('getReasoningContent', () => {
  it('should join all reasoning parts', () => {
    const message = createMessage([
      { type: 'reasoning', text: 'first ' },
      { type: 'text', text: 'Hello' },
      { type: 'reasoning', text: 'second' },
    ]);

    expect(getReasoningContent(message)).toBe('first second');
  });

  it('should return empty string when no reasoning parts', () => {
    const message = createMessage([{ type: 'text', text: 'Hello' }]);

    expect(getReasoningContent(message)).toBe('');
  });
});

describe('isReasoningStreaming', () => {
  it('should return true when reasoning is streaming', () => {
    const message = createMessage([
      { type: 'reasoning', text: 'thinking...', state: 'streaming' },
    ]);

    expect(isReasoningStreaming(message)).toBe(true);
  });

  it('should return false when reasoning is done', () => {
    const message = createMessage([
      { type: 'reasoning', text: 'thought', state: 'done' },
    ]);

    expect(isReasoningStreaming(message)).toBe(false);
  });

  it('should return false when no reasoning parts', () => {
    const message = createMessage([{ type: 'text', text: 'Hello' }]);

    expect(isReasoningStreaming(message)).toBe(false);
  });
});

describe('isTextStreaming', () => {
  it('should return true when text is streaming', () => {
    const message = createMessage([
      { type: 'text', text: 'Hello...', state: 'streaming' },
    ]);

    expect(isTextStreaming(message)).toBe(true);
  });

  it('should return false when text is done', () => {
    const message = createMessage([
      { type: 'text', text: 'Hello', state: 'done' },
    ]);

    expect(isTextStreaming(message)).toBe(false);
  });

  it('should return false when no text parts', () => {
    const message = createMessage([{ type: 'reasoning', text: 'thinking' }]);

    expect(isTextStreaming(message)).toBe(false);
  });
});
