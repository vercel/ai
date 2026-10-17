import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v4/replace-nanoid';
import { applyTransform, readFixture, testTransform } from './test-utils';

describe('replace-nanoid', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-nanoid');
  });

  it('does not transform when imported from other packages', () => {
    testTransform(transformer, 'replace-nanoid-not-ai');
  });

  it('preserves calls, aliases, callbacks, exports, and shadowed bindings', () => {
    testTransform(transformer, 'replace-nanoid-bindings');
  });

  it('keeps migrated direct calls executable', () => {
    const output = applyTransform(
      transformer,
      "import { nanoid } from 'ai'; export const id = nanoid();",
    );
    const { outputText } = ts.transpileModule(output, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    });
    const exports: { id?: string } = {};

    runInNewContext(outputText, {
      exports,
      require: () => ({ generateId: () => 'generated-id' }),
    });

    expect(exports.id).toBe('generated-id');
  });

  it('does not change an already migrated file', () => {
    const { content } = readFixture('replace-nanoid-bindings', 'output');
    expect(applyTransform(transformer, content)).toBe(content);
  });
});
