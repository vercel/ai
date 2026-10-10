import assert from 'node:assert/strict';
import { createIdGenerator } from 'ai';

type InvalidCase = {
  label: string;
  options: Parameters<typeof createIdGenerator>[0];
  optionName: 'alphabet' | 'size';
};

const invalidCases: InvalidCase[] = [
  {
    label: 'empty alphabet',
    options: { alphabet: '' },
    optionName: 'alphabet',
  },
  { label: 'zero size', options: { size: 0 }, optionName: 'size' },
  { label: 'negative size', options: { size: -1 }, optionName: 'size' },
  { label: 'fractional size', options: { size: 1.5 }, optionName: 'size' },
  { label: 'NaN size', options: { size: Number.NaN }, optionName: 'size' },
  {
    label: 'positive infinite size',
    options: { size: Number.POSITIVE_INFINITY },
    optionName: 'size',
  },
  {
    label: 'negative infinite size',
    options: { size: Number.NEGATIVE_INFINITY },
    optionName: 'size',
  },
  {
    label: 'unsafe integer size',
    options: { size: Number.MAX_SAFE_INTEGER + 1 },
    optionName: 'size',
  },
];

function describeError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: typeof error, message: String(error) };
}

async function main() {
  const observations: unknown[] = [];
  const violations: string[] = [];

  for (const invalidCase of invalidCases) {
    try {
      const generateId = createIdGenerator(invalidCase.options);
      const ids: string[] = [];

      try {
        ids.push(generateId(), generateId());
        observations.push({
          label: invalidCase.label,
          acceptedAtConstruction: true,
          ids,
        });
      } catch (error) {
        observations.push({
          label: invalidCase.label,
          acceptedAtConstruction: true,
          generationError: describeError(error),
        });
      }

      violations.push(`${invalidCase.label} was accepted at construction`);
    } catch (error) {
      const details = describeError(error);
      const argument =
        typeof error === 'object' && error !== null && 'argument' in error
          ? error.argument
          : undefined;

      observations.push({
        label: invalidCase.label,
        acceptedAtConstruction: false,
        error: details,
        argument,
      });

      if (details.name !== 'AI_InvalidArgumentError') {
        violations.push(
          `${invalidCase.label} threw ${details.name} instead of AI_InvalidArgumentError`,
        );
      }
      if (
        argument !== invalidCase.optionName ||
        !details.message.includes(invalidCase.optionName)
      ) {
        violations.push(
          `${invalidCase.label} did not identify the ${invalidCase.optionName} option`,
        );
      }
    }
  }

  const unprefixedId = createIdGenerator({ size: 8 })();
  assert.equal(unprefixedId.length, 8);

  const prefixedId = createIdGenerator({
    prefix: 'msg',
    separator: '_',
    size: 8,
  })();
  assert.equal(prefixedId.startsWith('msg_'), true);
  assert.equal(prefixedId.length, 12);

  if (violations.length > 0) {
    console.error(JSON.stringify({ observations, violations }, null, 2));
    throw new Error(
      'ISSUE_22734_REPRODUCED: invalid ID configurations were accepted at construction',
    );
  }
}

await main();
