import SecureJSON from 'secure-json-parse';
import { fixJson } from './fix-json';
import { parsePartialJson } from './parse-partial-json';

vi.mock('secure-json-parse');
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
  vi.mocked(SecureJSON.parse).mockReturnValueOnce(parsedValue);

  expect(parsePartialJson(validJson)).toEqual({
    value: parsedValue,
    state: 'successful-parse',
  });
  expect(SecureJSON.parse).toHaveBeenCalledWith(validJson);
});

it('should repair and parse partial JSON', () => {
  const partialJson = '{"key": "value"';
  const fixedJson = '{"key": "value"}';
  const parsedValue = { key: 'value' };

  vi.mocked(SecureJSON.parse)
    .mockImplementationOnce(() => {
      throw new Error('Invalid JSON');
    })
    .mockReturnValueOnce(parsedValue);
  vi.mocked(fixJson).mockReturnValueOnce(fixedJson);

  expect(parsePartialJson(partialJson)).toEqual({
    value: parsedValue,
    state: 'repaired-parse',
  });
  expect(SecureJSON.parse).toHaveBeenCalledWith(partialJson);
  expect(fixJson).toHaveBeenCalledWith(partialJson);
  expect(SecureJSON.parse).toHaveBeenCalledWith(fixedJson);
});

it('should handle invalid JSON that cannot be repaired', () => {
  const invalidJson = 'not json at all';

  vi.mocked(SecureJSON.parse).mockImplementation(() => {
    throw new Error('Invalid JSON');
  });
  vi.mocked(fixJson).mockReturnValueOnce(invalidJson);

  expect(parsePartialJson(invalidJson)).toEqual({
    value: undefined,
    state: 'failed-parse',
  });
  expect(SecureJSON.parse).toHaveBeenCalledWith(invalidJson);
  expect(fixJson).toHaveBeenCalledWith(invalidJson);
  expect(SecureJSON.parse).toHaveBeenCalledWith(invalidJson);
});
