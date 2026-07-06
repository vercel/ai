import { describe, it } from 'vitest';
import transformer from '../codemods/v7/replace-gladia-transcription-options';
import { testTransform } from './test-utils';

describe('replace-gladia-transcription-options', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-gladia-transcription-options');
  });
});
