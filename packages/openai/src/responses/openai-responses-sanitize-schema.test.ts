import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';
import { removePatternKeyword } from './openai-responses-sanitize-schema';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/zod-v4-string-format-schema.json',
);

const zodV4StringFormatFixture = JSON.parse(
  readFileSync(fixturePath, 'utf8'),
) as Record<string, unknown>;

function collectStringPatterns(value: unknown): string[] {
  const patterns: string[] = [];

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (node == null || typeof node !== 'object') {
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === 'pattern' && typeof child === 'string') {
        patterns.push(child);
        continue;
      }

      visit(child);
    }
  };

  visit(value);
  return patterns;
}

describe('removePatternKeyword', () => {
  it('strips lookaround and other format patterns from the zod v4 fixture while keeping format', () => {
    const patterns = collectStringPatterns(zodV4StringFormatFixture);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some(pattern => /\(\?[!<=]/.test(pattern))).toBe(true);

    const sanitized = removePatternKeyword(zodV4StringFormatFixture);

    expect(collectStringPatterns(sanitized)).toEqual([]);
    expect(sanitized).toMatchObject({
      properties: {
        email: { type: 'string', format: 'email' },
        kidId: { type: 'string', format: 'uuid' },
        birthDate: { type: 'string', format: 'date' },
        contacts: {
          items: {
            properties: {
              email: { type: 'string', format: 'email' },
            },
          },
        },
      },
    });
    expect(
      (sanitized.properties as Record<string, { pattern?: string }>).email
        .pattern,
    ).toBeUndefined();
  });

  it('strips pattern from live zod v4 email/uuid/date JSON Schema', () => {
    const schema = zodSchema(
      z4.object({
        email: z4.email(),
        kidId: z4.uuid(),
        birthDate: z4.iso.date(),
        contacts: z4.array(z4.object({ email: z4.email() })),
      }),
    ).jsonSchema;

    expect(schema).not.toBeInstanceOf(Promise);

    const jsonSchema = schema as Record<string, unknown>;
    const patterns = collectStringPatterns(jsonSchema);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some(pattern => /\(\?[!<=]/.test(pattern))).toBe(true);

    const sanitized = removePatternKeyword(jsonSchema);

    expect(collectStringPatterns(sanitized)).toEqual([]);
    expect(sanitized).toMatchObject({
      properties: {
        email: { type: 'string', format: 'email' },
        kidId: { type: 'string', format: 'uuid' },
        birthDate: { type: 'string', format: 'date' },
        contacts: {
          items: {
            properties: {
              email: { type: 'string', format: 'email' },
            },
          },
        },
      },
    });
  });

  it('does not treat a property named pattern as the JSON Schema keyword', () => {
    const schema = {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          format: 'email',
          pattern:
            "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$",
        },
      },
      required: ['pattern'],
    };

    expect(removePatternKeyword(schema)).toEqual({
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          format: 'email',
        },
      },
      required: ['pattern'],
    });
  });

  it('returns non-object values unchanged', () => {
    expect(removePatternKeyword(undefined)).toBeUndefined();
    expect(removePatternKeyword(null)).toBeNull();
    expect(removePatternKeyword('^(?!x).+$')).toBe('^(?!x).+$');
  });
});
