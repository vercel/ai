import { fc } from '@fast-check/vitest';

/* c8 ignore start */
class Partitions extends fc.Arbitrary<number[]> {
  constructor(private readonly length: number) {
    super();
  }

  generate(
    rng: fc.Random,
    _biasFactor: number | undefined,
  ): fc.Value<number[]> {
    const partitions = rng.nextInt(
      Math.floor(Math.max(1, this.length / 2)),
      this.length,
    );

    const partitionIndices = Array.from(
      { length: this.length - 1 },
      (_, i) => i,
    );

    while (partitionIndices.length > partitions) {
      partitionIndices.splice(rng.nextInt(0, partitionIndices.length - 1), 1);
    }

    return new fc.Value(partitionIndices, {});
  }

  canShrinkWithoutContext(_: unknown): _ is number[] {
    return true;
  }

  shrink(value: number[], _context: unknown): fc.Stream<fc.Value<number[]>> {
    if (value.length === 0) {
      return fc.Stream.nil();
    }

    const generator = function* () {
      for (let index = 0; index < value.length; index++) {
        const newPartitions = value
          .slice(0, index)
          .concat(value.slice(index + 1));
        // console.log({ newPartitions })
        // yield this slice without this index
        yield new fc.Value(newPartitions, {});
      }
    };

    return fc.stream(generator());
  }
}
type StringPartsContext = number[];

class StringParts extends fc.Arbitrary<string[]> {
  partitions: Partitions;

  constructor(readonly input: string) {
    super();
    this.partitions = new Partitions(this.input.length);
  }

  generate(rng: fc.Random, biasFactor: number | undefined): fc.Value<string[]> {
    const { value: partitionIndices } = this.partitions.generate(
      rng,
      biasFactor,
    );

    const parts: string[] = this.buildParts(partitionIndices);

    return new fc.Value(parts, partitionIndices as StringPartsContext);
  }

  private buildParts(partitionIndices: number[]) {
    const parts: string[] = [];
    let last = 0;
    for (const index of partitionIndices) {
      parts.push(this.input.slice(last, index + 1));
      last = index + 1;
    }
    parts.push(this.input.slice(last));
    // console.log({ parts, builtString: parts.join(""), input: this.input });
    return parts;
  }

  canShrinkWithoutContext(_: unknown): _ is string[] {
    return true;
  }

  shrink(
    value: string[],
    context: StringPartsContext,
  ): fc.Stream<fc.Value<string[]>> {
    if (value.length === 1) {
      // Cannot shrink further
      return fc.Stream.nil();
    }

    return this.partitions
      .shrink(context, undefined)
      .map(
        ({ value: partitionIndices }) =>
          new fc.Value(
            this.buildParts(partitionIndices),
            partitionIndices as StringPartsContext,
          ),
      );
  }
}

function negativeZeroClean(value: any): boolean {
  if (Object.is(value, -0)) {
    return false;
  }

  if (value === null) {
    return true;
  }

  if (typeof value === 'object') {
    return Array.isArray(value)
      ? value.every(x => negativeZeroClean(x))
      : Object.values(value as object).every(x => negativeZeroClean(x));
  }

  return true;
}

export const partialJsonString = fc
  .string()
  .chain(input =>
    fc.tuple(fc.constant(input), new StringParts(JSON.stringify(input))),
  );

export const partitionedJson = fc
  .jsonValue({ maxDepth: 10, depthSize: 10 })
  .filter(x => negativeZeroClean(x))
  .chain(input =>
    fc.tuple(fc.constant(input), new StringParts(JSON.stringify(input))),
  );

const arbitraryWhitespace = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'));

export const multipleJsonObjects = fc
  .array(fc.jsonValue({ maxDepth: 10, depthSize: 10 }), {
    minLength: 2,
    maxLength: 50,
  })
  .filter(x => x.every(x => negativeZeroClean(x) && typeof x === 'object'))
  .chain(input => fc.tuple(fc.constant(input), arbitraryWhitespace))
  .chain(([values, whitespace]) =>
    fc.tuple(
      fc.constant(values),
      new StringParts(values.map(x => JSON.stringify(x)).join(whitespace)),
    ),
  );

/* c8 ignore end */
