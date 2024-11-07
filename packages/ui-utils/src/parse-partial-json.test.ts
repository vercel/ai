import { safeParseJSON } from '@ai-sdk/provider-utils';
import { fixJson } from './fix-json';
import { parsePartialJson } from './parse-partial-json';
import { JSONParseError } from '@ai-sdk/provider';

vi.mock('@ai-sdk/provider-utils');
vi.mock('./fix-json');

it('should handle nullish input', () => {
  expect(parsePartialJson(undefined)).toEqual({
    value: undefined,
    state: 'undefined-input',
  });
});

it('should parse valid JSON', () => {
  const validJson = '{"key": "value"}';
  const parsedValue = { key: 'value' };
  vi.mocked(safeParseJSON).mockReturnValueOnce({
    success: true,
    value: parsedValue,
  });

  expect(parsePartialJson(validJson)).toEqual({
    value: parsedValue,
    state: 'successful-parse',
  });
  expect(safeParseJSON).toHaveBeenCalledWith({ text: validJson });
});

it('should repair and parse partial JSON', () => {
  const partialJson = '{"key": "value"';
  const fixedJson = '{"key": "value"}';
  const parsedValue = { key: 'value' };

  vi.mocked(safeParseJSON)
    .mockReturnValueOnce({
      success: false,
      error: new JSONParseError({ text: partialJson, cause: undefined }),
    })
    .mockReturnValueOnce({ success: true, value: parsedValue });
  vi.mocked(fixJson).mockReturnValueOnce(fixedJson);

  expect(parsePartialJson(partialJson)).toEqual({
    value: parsedValue,
    state: 'repaired-parse',
  });
  expect(safeParseJSON).toHaveBeenCalledWith({ text: partialJson });
  expect(fixJson).toHaveBeenCalledWith(partialJson);
  expect(safeParseJSON).toHaveBeenCalledWith({ text: fixedJson });
});

it('should handle invalid JSON that cannot be repaired', () => {
  const invalidJson = 'not json at all';

  vi.mocked(safeParseJSON).mockReturnValue({
    success: false,
    error: new JSONParseError({ text: invalidJson, cause: undefined }),
  });
  vi.mocked(fixJson).mockReturnValueOnce(invalidJson);

  expect(parsePartialJson(invalidJson)).toEqual({
    value: undefined,
    state: 'failed-parse',
  });
  expect(safeParseJSON).toHaveBeenCalledWith({ text: invalidJson });
  expect(fixJson).toHaveBeenCalledWith(invalidJson);
  expect(safeParseJSON).toHaveBeenCalledWith({ text: invalidJson });
});
