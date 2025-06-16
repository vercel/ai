import { describe, it } from 'vitest';
import transformer from '../codemods/move-langchain-adapter';
import { testTransform } from './test-utils';

describe('move-langchain-adapter', () => {
  it('transforms basic usage', () => {
    testTransform(transformer, 'move-langchain-adapter-basic');
  });
  it('transforms alias import', () => {
    testTransform(transformer, 'move-langchain-adapter-alias');
  });
  it('transforms multiple imports (first)', () => {
    testTransform(transformer, 'move-langchain-adapter-multi');
  });
  it('transforms multiple imports (last)', () => {
    testTransform(transformer, 'move-langchain-adapter-multi-last');
  });
  it('transforms unused import', () => {
    testTransform(transformer, 'move-langchain-adapter-unused');
  });
  it('does not transform not-ai import', () => {
    testTransform(transformer, 'move-langchain-adapter-not-ai');
  });
  it('does not transform already migrated code', () => {
    testTransform(transformer, 'move-langchain-adapter-already-migrated');
  });
  it('does not transform require destructure', () => {
    testTransform(transformer, 'move-langchain-adapter-require');
  });
});
