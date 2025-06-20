import { describe, it } from 'vitest';
import transformer from '../codemods/move-react-to-ai-sdk';
import { testTransform } from './test-utils';

describe('move-react-to-ai-sdk', () => {
  it('transforms basic usage', () => {
    testTransform(transformer, 'move-react-to-ai-sdk-basic');
  });

  it('transforms multiple imports', () => {
    testTransform(transformer, 'move-react-to-ai-sdk-multi');
  });

  it('transforms aliased imports', () => {
    testTransform(transformer, 'move-react-to-ai-sdk-alias');
  });

  it('does not transform other imports', () => {
    testTransform(transformer, 'move-react-to-ai-sdk-other');
  });
});
