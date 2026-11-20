import { safeParseJSON } from '@ai-sdk/provider-utils';
import { repairJson } from './fix-json';
import { parsePartialJson } from './parse-partial-json';
import { JSONParseError } from '@ai-sdk/provider';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@ai-sdk/provider-utils');
vi.mock('./fix-json');

describe('parsePartialJson', () => {
  it('should handle nullish input', async () => {
    expect(await parsePartialJson(undefined)).toEqual({
      value: undefined,
      state: 'undefined-input',
    });
  });

  it('should parse valid JSON', async () => {
    const validJson = '{"key": "value"}';
    const parsedValue = { key: 'value' };

    vi.mocked(repairJson).mockReturnValueOnce({
      text: validJson,
      isTruncated: false,
    });

    vi.mocked(safeParseJSON).mockResolvedValueOnce({
      success: true,
      value: parsedValue,
      rawValue: parsedValue,
    });

    expect(await parsePartialJson(validJson)).toEqual({
      value: parsedValue,
      state: 'successful-parse',
    });
    expect(safeParseJSON).toHaveBeenCalledWith({ text: validJson });
  });

  it('should repair and parse partial JSON', async () => {
    const partialJson = '{"key": "value"';
    const fixedJson = '{"key": "value"}';
    const parsedValue = { key: 'value' };

    vi.mocked(safeParseJSON)
      .mockResolvedValueOnce({
        success: false,
        error: new JSONParseError({ text: partialJson, cause: undefined }),
        rawValue: partialJson,
      })
      .mockResolvedValueOnce({
        success: true,
        value: parsedValue,
        rawValue: parsedValue,
      });
    vi.mocked(repairJson).mockReturnValueOnce({
      text: fixedJson,
      isTruncated: false,
    });

    expect(await parsePartialJson(partialJson)).toEqual({
      value: parsedValue,
      state: 'repaired-parse',
    });
    expect(safeParseJSON).toHaveBeenCalledWith({ text: partialJson });
    expect(repairJson).toHaveBeenCalledWith(partialJson);
    expect(safeParseJSON).toHaveBeenCalledWith({ text: fixedJson });
  });

  it('should handle invalid JSON that cannot be repaired', async () => {
    const invalidJson = 'not json at all';

    vi.mocked(safeParseJSON).mockResolvedValue({
      success: false,
      error: new JSONParseError({ text: invalidJson, cause: undefined }),
      rawValue: invalidJson,
    });
    vi.mocked(repairJson).mockReturnValueOnce({
      text: invalidJson,
      isTruncated: false,
    });

    expect(await parsePartialJson(invalidJson)).toEqual({
      value: undefined,
      state: 'failed-parse',
    });
    expect(safeParseJSON).toHaveBeenCalledWith({ text: invalidJson });
    expect(repairJson).toHaveBeenCalledWith(invalidJson);
    expect(safeParseJSON).toHaveBeenCalledWith({ text: invalidJson });
  });

  it('should only parse the repaired text when the input is truncated', async () => {
    const partialJson = '{"key": "val';
    const fixedJson = '{"key": "val"}';
    const parsedValue = { key: 'val' };

    vi.mocked(safeParseJSON).mockReset();
    vi.mocked(safeParseJSON).mockResolvedValueOnce({
      success: true,
      value: parsedValue,
      rawValue: parsedValue,
    });
    vi.mocked(repairJson).mockReturnValueOnce({
      text: fixedJson,
      isTruncated: true,
    });

    expect(await parsePartialJson(partialJson)).toEqual({
      value: parsedValue,
      state: 'repaired-parse',
    });
    expect(safeParseJSON).toHaveBeenCalledTimes(1);
    expect(safeParseJSON).toHaveBeenCalledWith({ text: fixedJson });
  });
});
