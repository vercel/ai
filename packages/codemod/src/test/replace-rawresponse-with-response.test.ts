import { describe, it } from 'vitest';
import transformer from '../codemods/v5/replace-rawresponse-with-response';
import { testTransform } from './test-utils';

describe('replace-rawresponse-with-response', () => {
  it('preserves local destructuring bindings', () => {
    testTransform(
      transformer,
      'replace-rawresponse-with-response-destructuring',
    );
  });
});
