import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v4/replace-token-usage-types';
import { applyTransform, testTransform } from './test-utils';

describe('replace-token-usage-types', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-token-usage-types');
  });

  it.each([
    ['TokenUsage', 'LanguageModelUsage'],
    ['CompletionTokenUsage', 'LanguageModelUsage'],
    ['EmbeddingTokenUsage', 'EmbeddingModelUsage'],
  ])('preserves an alias for %s', (oldName, newName) => {
    const input = `import type { ${oldName} as Usage } from 'ai';
const usage: Usage = {} as Usage;`;

    expect(applyTransform(transformer, input)).toBe(
      `import type { ${newName} as Usage } from 'ai';
const usage: Usage = {} as Usage;`,
    );
  });

  it('preserves multiple aliases that map to the same new type', () => {
    const input = `import type { TokenUsage as First, CompletionTokenUsage as Second, TokenUsage } from 'ai';
type Usages = [First, Second, TokenUsage];`;

    expect(applyTransform(transformer, input)).toBe(
      `import type { LanguageModelUsage as First, LanguageModelUsage as Second, LanguageModelUsage as TokenUsage } from 'ai';
type Usages = [First, Second, TokenUsage];`,
    );
  });

  it('preserves existing new-type imports alongside migrated bindings', () => {
    const input = `import type { TokenUsage, LanguageModelUsage, CompletionTokenUsage as Completion } from 'ai';
type Usages = [TokenUsage, LanguageModelUsage, Completion];`;

    expect(applyTransform(transformer, input)).toBe(
      `import type { LanguageModelUsage as TokenUsage, LanguageModelUsage, LanguageModelUsage as Completion } from 'ai';
type Usages = [TokenUsage, LanguageModelUsage, Completion];`,
    );
  });

  it('preserves declarations and comments alongside a separate new-type import', () => {
    const input = `// @ts-nocheck
import type { TokenUsage } from 'ai';
import type { LanguageModelUsage } from 'ai';
type Usage = TokenUsage;`;

    expect(applyTransform(transformer, input)).toBe(
      `// @ts-nocheck
import type { LanguageModelUsage as TokenUsage } from 'ai';
import type { LanguageModelUsage } from 'ai';
type Usage = TokenUsage;`,
    );
  });

  it('keeps distinct aliases across import declarations', () => {
    const input = `import type { TokenUsage as First } from 'ai';
import type { CompletionTokenUsage as Second } from 'ai';
import type { LanguageModelUsage as Existing } from 'ai';
type Usages = [First, Second, Existing];`;

    const output = applyTransform(transformer, input);
    expect(output).toBe(
      `import type { LanguageModelUsage as First } from 'ai';
import type { LanguageModelUsage as Second } from 'ai';
import type { LanguageModelUsage as Existing } from 'ai';
type Usages = [First, Second, Existing];`,
    );
    expect(applyTransform(transformer, output)).toBe(output);
  });

  it('preserves aliases that match another old usage type name', () => {
    const input = `import type { TokenUsage as EmbeddingTokenUsage } from 'ai';
type Usage = EmbeddingTokenUsage;`;

    expect(applyTransform(transformer, input)).toBe(
      `import type { LanguageModelUsage as EmbeddingTokenUsage } from 'ai';
type Usage = EmbeddingTokenUsage;`,
    );
  });

  it('keeps an alias from colliding with another replacement type', () => {
    const input = `import type { TokenUsage as EmbeddingModelUsage, EmbeddingTokenUsage } from 'ai';
type Usages = [EmbeddingModelUsage, EmbeddingTokenUsage];`;

    expect(applyTransform(transformer, input)).toBe(
      `import type { LanguageModelUsage as EmbeddingModelUsage, EmbeddingModelUsage as EmbeddingTokenUsage } from 'ai';
type Usages = [EmbeddingModelUsage, EmbeddingTokenUsage];`,
    );
  });

  it('keeps an alias in another declaration from colliding with a replacement', () => {
    const input = `import type { EmbeddingTokenUsage } from 'ai';
import type { TokenUsage as EmbeddingModelUsage } from 'ai';
type Usages = [EmbeddingModelUsage, EmbeddingTokenUsage];`;

    expect(applyTransform(transformer, input)).toBe(
      `import type { EmbeddingModelUsage as EmbeddingTokenUsage } from 'ai';
import type { LanguageModelUsage as EmbeddingModelUsage } from 'ai';
type Usages = [EmbeddingModelUsage, EmbeddingTokenUsage];`,
    );
  });

  it('retains inline type-only import specifiers', () => {
    const input = `import { type TokenUsage as Usage } from 'ai';
type Result = Usage;`;

    expect(applyTransform(transformer, input)).toBe(
      `import { type LanguageModelUsage as Usage } from 'ai';
type Result = Usage;`,
    );
  });

  it('does not rewrite unrelated old type names when migrating aliases', () => {
    const input = `import type { TokenUsage as Usage } from 'ai';
import type { CompletionTokenUsage } from 'other';
type TokenUsage = string;
type Result = [Usage, TokenUsage, CompletionTokenUsage];`;

    expect(applyTransform(transformer, input)).toBe(
      `import type { LanguageModelUsage as Usage } from 'ai';
import type { CompletionTokenUsage } from 'other';
type TokenUsage = string;
type Result = [Usage, TokenUsage, CompletionTokenUsage];`,
    );
  });

  it('keeps bindings independent across ambient modules', () => {
    const input = `declare module 'first-package' {
  import type { TokenUsage as Usage } from 'ai';
  export type Result = Usage;
}
declare module 'second-package' {
  import type { LanguageModelUsage as Usage } from 'ai';
  export type Result = Usage;
}`;

    expect(applyTransform(transformer, input)).toBe(
      `declare module 'first-package' {
  import type { LanguageModelUsage as Usage } from 'ai';
  export type Result = Usage;
}
declare module 'second-package' {
  import type { LanguageModelUsage as Usage } from 'ai';
  export type Result = Usage;
}`,
    );
  });

  it('preserves generic parameters and local types shadowing the imported name', () => {
    const input = `import type { TokenUsage } from 'ai';
type Usage = TokenUsage;
function identity<TokenUsage>(usage: TokenUsage): TokenUsage { return usage; }
function local() {
  type TokenUsage = string;
  const usage: TokenUsage = 'local';
}`;

    expect(applyTransform(transformer, input)).toBe(
      `import type { LanguageModelUsage as TokenUsage } from 'ai';
type Usage = TokenUsage;
function identity<TokenUsage>(usage: TokenUsage): TokenUsage { return usage; }
function local() {
  type TokenUsage = string;
  const usage: TokenUsage = 'local';
}`,
    );
  });
});
