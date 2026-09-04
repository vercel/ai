import type { AttributeValue } from '@opentelemetry/api';
import { expect, it } from 'vitest';
import { selectAttributes } from './select-attributes';

type OtlpAnyValue =
  | { stringValue: string }
  | { intValue: number }
  | { boolValue: boolean }
  | { arrayValue: { values: OtlpAnyValue[] } }
  | Record<string, never>;

function toOtlpAnyValue(value: unknown): OtlpAnyValue {
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toOtlpAnyValue) } };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'number') {
    return { intValue: value };
  }

  if (typeof value === 'boolean') {
    return { boolValue: value };
  }

  return {};
}

it('drops invalid array attribute entries', () => {
  const result = selectAttributes(
    { isEnabled: true },
    {
      keep: ['stop', undefined, {}, 'length'] as unknown as AttributeValue,
      drop: [undefined, {}] as unknown as AttributeValue,
      dropMixed: ['stop', 1] as unknown as AttributeValue,
      input: {
        input: () => [undefined, {}, 'input'] as unknown as AttributeValue,
      },
      output: {
        output: () => [undefined] as unknown as AttributeValue,
      },
    },
  );

  expect(result).toEqual({
    keep: ['stop', 'length'],
    input: ['input'],
  });
});

it('drops non-finite direct and resolver-produced numeric attributes', () => {
  const result = selectAttributes(
    { isEnabled: true },
    {
      finite: 1,
      directNaN: Number.NaN,
      directInfinity: Number.POSITIVE_INFINITY,
      directArray: [1, Number.NEGATIVE_INFINITY],
      inputNaN: {
        input: () => Number.NaN,
      },
      inputArray: {
        input: () => [1, Number.POSITIVE_INFINITY],
      },
      outputInfinity: {
        output: () => Number.NEGATIVE_INFINITY,
      },
      outputArray: {
        output: () => [1, Number.NaN],
      },
    },
  );

  expect(result).toEqual({
    finite: 1,
  });
});

it('drops array attributes that serialize to empty OTLP AnyValues', () => {
  const attributeValue = [undefined] as unknown as AttributeValue;

  expect({
    key: 'test.attribute',
    value: toOtlpAnyValue(attributeValue),
  }).toEqual({
    key: 'test.attribute',
    value: {
      arrayValue: {
        values: [{}],
      },
    },
  });

  expect(
    selectAttributes(
      { isEnabled: true },
      {
        'test.attribute': attributeValue,
      },
    ),
  ).toEqual({});
});
