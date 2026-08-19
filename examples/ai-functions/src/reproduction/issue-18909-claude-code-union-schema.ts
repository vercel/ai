import { z } from 'zod/v4';
import { jsonSchemaToZodShape } from '../../../../packages/harness-claude-code/src/bridge/json-schema-to-zod';

const FAILURE_SIGNAL =
  'ISSUE_18909_REPRODUCED: Claude Code bridge accepted values outside string-or-number anyOf/oneOf tool schemas.';

function createToolSchema(keyword: 'anyOf' | 'oneOf') {
  return z.object(
    jsonSchemaToZodShape({
      type: 'object',
      properties: {
        value: {
          [keyword]: [{ type: 'string' }, { type: 'number' }],
        },
      },
      required: ['value'],
      additionalProperties: false,
    }),
  );
}

async function main() {
  const schemas = {
    anyOf: createToolSchema('anyOf'),
    oneOf: createToolSchema('oneOf'),
  };

  for (const [keyword, schema] of Object.entries(schemas)) {
    for (const value of ['text', 42]) {
      if (!schema.safeParse({ value }).success) {
        throw new Error(
          `Reproduction precondition failed: ${keyword} rejected supported value ${JSON.stringify(value)}.`,
        );
      }
    }
  }

  const unsupportedBranchSchema = z.object(
    jsonSchemaToZodShape({
      type: 'object',
      properties: {
        value: {
          anyOf: [{ type: 'string' }, { not: { type: 'boolean' } }],
        },
      },
      required: ['value'],
    }),
  );

  if (!unsupportedBranchSchema.safeParse({ value: { nested: true } }).success) {
    throw new Error(
      'Reproduction precondition failed: an unsupported union branch did not retain the safe fallback.',
    );
  }

  const invalidAcceptances = Object.entries(schemas).flatMap(
    ([keyword, schema]) =>
      [true, { nested: true }]
        .filter(value => schema.safeParse({ value }).success)
        .map(value => ({ keyword, value })),
  );

  console.log(
    JSON.stringify(
      {
        expected:
          'The bridge schema accepts strings and numbers, rejects booleans and objects, and does not throw for unsupported branches.',
        invalidAcceptances,
      },
      null,
      2,
    ),
  );

  if (invalidAcceptances.length > 0) {
    throw new Error(
      `${FAILURE_SIGNAL} Accepted cases: ${JSON.stringify(invalidAcceptances)}.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
