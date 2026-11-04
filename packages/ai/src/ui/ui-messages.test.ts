import { describe, it, expect } from 'vitest';
import {
  getStaticToolName,
  isCustomContentUIPart,
  isDataUIPart,
  isToolOutputErrorUIPart,
} from './ui-messages';

describe('getStaticToolName', () => {
  it('should return the tool name after the "tool-" prefix', () => {
    expect(
      getStaticToolName({
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
      getStaticToolName({
        type: 'tool-get-location',
        toolCallId: 'tool1',
        state: 'output-available',
        input: {},
        output: 'some result',
      }),
    ).toBe('get-location');
  });
});

describe('isCustomContentUIPart', () => {
  it('should return true for a custom part', () => {
    expect(
      isCustomContentUIPart({
        type: 'custom',
        kind: 'test-provider.compaction',
        providerMetadata: {
          openai: { itemId: 'cmp_123' },
        },
      }),
    ).toBe(true);
  });

  it('should return true for a custom part without providerMetadata', () => {
    expect(
      isCustomContentUIPart({
        type: 'custom',
        kind: 'openai.compaction',
      }),
    ).toBe(true);
  });

  it('should return false for a text part', () => {
    expect(
      isCustomContentUIPart({
        type: 'text',
        text: 'some text',
      }),
    ).toBe(false);
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

describe('isToolOutputErrorUIPart', () => {
  it('should return true for a static tool output error part', () => {
    expect(
      isToolOutputErrorUIPart({
        type: 'tool-weather',
        toolCallId: 'tool1',
        state: 'output-error',
        input: { city: 'Berlin' },
        errorText: 'Weather service unavailable',
      }),
    ).toBe(true);
  });

  it('should return true for a dynamic tool output error part', () => {
    expect(
      isToolOutputErrorUIPart({
        type: 'dynamic-tool',
        toolName: 'weather',
        toolCallId: 'tool1',
        state: 'output-error',
        input: { city: 'Berlin' },
        errorText: 'Weather service unavailable',
      }),
    ).toBe(true);
  });

  it('should return false for a successful tool output part', () => {
    expect(
      isToolOutputErrorUIPart({
        type: 'tool-weather',
        toolCallId: 'tool1',
        state: 'output-available',
        input: { city: 'Berlin' },
        output: { temperature: 18 },
      }),
    ).toBe(false);
  });

  it('should return false for a non-tool part', () => {
    expect(
      isToolOutputErrorUIPart({
        type: 'text',
        text: 'Weather service unavailable',
      }),
    ).toBe(false);
  });
});
