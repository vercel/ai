import { describe, expect, it } from 'vitest';
import { getDeprecationCode } from './deprecations';

describe('getDeprecationCode', () => {
  it.each([
    ['generateObject', 'AISDK_DEP_GENERATE_OBJECT'],
    ['streamObject', 'AISDK_DEP_STREAM_OBJECT'],
    ['experimental_generateSpeech', 'AISDK_DEP_EXPERIMENTAL_GENERATE_SPEECH'],
    ['experimental_transcribe', 'AISDK_DEP_EXPERIMENTAL_TRANSCRIBE'],
    ['"image" content part', 'AISDK_DEP_IMAGE_CONTENT_PART'],
    [
      'rawInput in output-error UI message parts',
      'AISDK_DEP_UI_MESSAGE_RAW_INPUT',
    ],
    ...[
      'file-data',
      'file-url',
      'file-id',
      'file-reference',
      'image-data',
      'image-url',
      'image-file-id',
      'image-file-reference',
    ].map(type => [
      `"tool-result" content of type "${type}"`,
      `AISDK_DEP_TOOL_RESULT_${type.replaceAll('-', '_').toUpperCase()}`,
    ]),
  ])('keeps the registered code for %s', (setting, code) => {
    expect(getDeprecationCode({ setting })).toBe(code);
  });

  it('scopes provider warnings separately from built-in deprecations', () => {
    expect(
      getDeprecationCode({ setting: 'generateObject', provider: 'test' }),
    ).toBe('AISDK_DEP_PROVIDER_test__generateObject');
  });

  it('does not collapse punctuation, case, Unicode, or provider boundaries', () => {
    const inputs = [
      { setting: 'old-key', provider: 'test' },
      { setting: 'old_key', provider: 'test' },
      { setting: 'old_002Dkey', provider: 'test' },
      { setting: 'Old-key', provider: 'test' },
      { setting: 'old-key', provider: 'other' },
      { setting: 'old-key' },
      { setting: 'key', provider: 'test__old' },
      { setting: 'old__key', provider: 'test' },
      { setting: '😀' },
      { setting: '😁' },
      { setting: '\ud800' },
      { setting: 'toString' },
    ];
    const codes = inputs.map(getDeprecationCode);
    expect(new Set(codes).size).toBe(inputs.length);
    expect(codes).toEqual(inputs.map(getDeprecationCode));
    expect(codes.every(code => /^[a-zA-Z0-9_]+$/.test(code))).toBe(true);
    expect(codes[0]).toBe('AISDK_DEP_PROVIDER_test__old_002Dkey');
  });
});
