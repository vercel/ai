import { describe, it, expect } from 'vitest';
import { getToolName, isDataUIPart } from './ui-messages';

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
