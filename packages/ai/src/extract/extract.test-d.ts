import { expectTypeOf, it } from 'vitest';
import { ExtractionMockModelV4 } from '../test/extraction-mock-model-v4';
import {
  experimental_extract as extract,
  type Experimental_ExtractionField as ExtractionField,
  type Experimental_ExtractionSource as ExtractionSource,
} from '../index';

it('infers value types from inline fields', async () => {
  const result = await extract({
    model: new ExtractionMockModelV4(),
    state: 'Invoice INV-2041',
    fields: {
      invoiceNumber: { type: 'text' },
      total: { type: 'number', decimals: 2 },
      dueDate: { type: 'date' },
      dueTime: { type: 'time' },
      dueAt: { type: 'datetime' },
      wait: { type: 'duration', unit: 'hours' },
      names: { type: 'list', items: 'text' },
      scores: { type: 'list', items: 'number' },
      dates: { type: 'list', items: 'date' },
    },
  });
  expectTypeOf(result.answers.invoiceNumber.value).toEqualTypeOf<
    string | null
  >();
  expectTypeOf(result.answers.total.value).toEqualTypeOf<number | null>();
  expectTypeOf(result.answers.total.guess).toEqualTypeOf<number | undefined>();
  expectTypeOf(result.answers.dueDate.value).toEqualTypeOf<string | null>();
  expectTypeOf(result.answers.dueTime.value).toEqualTypeOf<string | null>();
  expectTypeOf(result.answers.dueAt.value).toEqualTypeOf<string | null>();
  expectTypeOf(result.answers.wait.value).toEqualTypeOf<number | null>();
  expectTypeOf(result.answers.names.value).toEqualTypeOf<string[] | null>();
  expectTypeOf(result.answers.scores.value).toEqualTypeOf<number[] | null>();
  expectTypeOf(result.answers.dates.value).toEqualTypeOf<string[] | null>();
  expectTypeOf(result.answers.invoiceNumber.source).toEqualTypeOf<
    ExtractionSource | undefined
  >();
  // @ts-expect-error No unknown field IDs.
  result.answers.missing;
  // @ts-expect-error List answers have per-item sources, not one source.
  result.answers.names.source;
});

it('accepts readonly reusable definitions', async () => {
  const fields = {
    total: { type: 'number', instructions: ['Total due'] },
  } as const satisfies Record<string, ExtractionField>;
  const result = await extract({
    model: new ExtractionMockModelV4(),
    state: { invoice: { total: 10 } },
    fields,
  });
  expectTypeOf(result.answers.total.value).toEqualTypeOf<number | null>();
});

it('rejects invalid field definitions', async () => {
  await extract({
    model: new ExtractionMockModelV4(),
    state: '',
    // @ts-expect-error Lists require an item type.
    fields: { names: { type: 'list' } },
  });
  await extract({
    model: new ExtractionMockModelV4(),
    state: '',
    // @ts-expect-error Unknown duration units are rejected.
    fields: { wait: { type: 'duration', unit: 'fortnights' } },
  });
});
