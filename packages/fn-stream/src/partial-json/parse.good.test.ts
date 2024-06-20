import { test } from '@fast-check/vitest';
import {
  multipleJsonObjects,
  partialJsonString,
  partitionedJson,
} from './helpers/arbitrary';
import { complete, partial } from './helpers/partials';
import { internalGetRoot, internalGetStateRoot } from './helpers/util';
import { StreamingParser } from '../';

if (process.env.NODE_PROFILE) {
  beforeEach(() => {
    console.profile();
  });

  beforeEach(() => {
    console.profileEnd();
  });
}

test('parse() - empty objects', t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parse('{}'), {}, 'parses empty objects');
});

test('parse() - double string property names', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('{"a":1}'),
    { a: 1 },
    'parses double string property names',
  );
});

test('parse() - preserves __proto__ property names', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    // eslint-disable-next-line no-proto
    parser.parseComplete('{"__proto__":1}').__proto__,
    1,
    'preserves __proto__ property names',
  );
});

test('parse() - multiple properties', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('{"abc":1,"def":2}'),
    { abc: 1, def: 2 },
    'parses multiple properties',
  );
});

test('parse() - nested objects', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('{"a":{"b":2}}'),
    { a: { b: 2 } },
    'parses nested objects',
  );
});

test('parse() - empty arrays', t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parseComplete('[]'), [], 'parses empty arrays');
});

test('parse() - array values', t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parseComplete('[1]'), [1], 'parses array values');
});

test('parse() - multiple array values', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('[1,2]'),
    [1, 2],
    'parses multiple array values',
  );
});

test('parse() - nested arrays', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('[1,[2,3]]'),
    [1, [2, 3]],
    'parses nested arrays',
  );
});

test('parse() - nulls', t => {
  const parser = new StreamingParser();
  assert.equal(parser.parseComplete('null'), null, 'parses nulls');
});

test('parse() - true', t => {
  const parser = new StreamingParser();
  assert.equal(parser.parseComplete('true'), true, 'parses true');
});

test('parse() - false', t => {
  const parser = new StreamingParser();
  assert.equal(parser.parseComplete('false'), false, 'parses false');
});

test('parse() - negative zero', t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parseComplete('[-0]'), [-0], 'parses false');
});

test('parse() - integers', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('[1,23,456,7890]'),
    [1, 23, 456, 7890],
    'parses integers',
  );
});

test('parse() - signed numbers', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('[-1,-2,-0.1,-0]'),
    [-1, -2, -0.1, -0],
    'parses signed numbers',
  );
});

test('parse() - fractional numbers', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('[1.0,1.23]'),
    [1, 1.23],
    'parses fractional numbers',
  );
});

test('parse() - exponents', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete('[1e0,1e1,1e01,1.e0,1.1e0,1e-1,1e+1]'),
    [1, 10, 10, 1, 1.1, 0.1, 10],
    'parses exponents',
  );
});

test('parse() - 1', t => {
  const parser = new StreamingParser();
  assert.equal(parser.parseComplete('1'), 1, 'parses 1');
});

test('parse() - double quoted strings', t => {
  const parser = new StreamingParser();
  assert.equal(
    parser.parseComplete('"abc"'),
    'abc',
    `parses double quoted strings`,
  );
});

test('parse() - quotes in strings', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parseComplete(`["\\"","'"]`),
    ['"', "'"],
    'parses quotes in strings',
  );
});

test('parse() - escaped characters', t => {
  const parser = new StreamingParser();
  assert.equal(
    parser.parseComplete(`"\\b\\f\\n\\r\\t\\u01fF\\\\\\""`),
    '\b\f\n\r\t\u01FF\\"',
    'parses escaped characters',
  );
});

test('parse() - whitespace', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    parser.parse('{\t\v\f \u00A0\uFEFF\n\r\u2028\u2029\u2003}'),
    {},
    'parses whitespace',
  );
});

test('parse() - partially parsed string', t => {
  const parser = new StreamingParser();
  assert.equal(parser.parse('"abc'), 'abc');
  assert.equal(internalGetStateRoot(parser), 'partial');
  assert.equal(internalGetRoot(parser), 'abc');
  assert.equal(parser.parse('def'), 'abcdef');
  assert.equal(internalGetStateRoot(parser), 'partial');
  assert.equal(internalGetRoot(parser), 'abcdef');
  assert.equal(parser.parse('ghi"'), 'abcdefghi');
  assert.equal(internalGetStateRoot(parser), 'complete');
  assert.equal(internalGetRoot(parser), 'abcdefghi');
});

test(`parse() - partial after array value`, t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parse('["1"'), ['1']);
});

test(`parse() - continue after array value`, t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parse('["1"'), ['1']);
  assert.deepEqual(parser.parse(',"2"'), ['1', '2']);
  assert.deepEqual(parser.parse(']'), ['1', '2']);
});

test(`parse() - continue within array value`, t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parse('["1"'), ['1']);
  assert.deepEqual(parser.parse(',"2'), ['1', '2']);
  assert.deepEqual(parser.parse('3"'), ['1', '23']);
  assert.deepEqual(parser.parse(',4]'), ['1', '23', 4]);
});

test.prop([partialJsonString])(
  'Can parse partial strings',
  ([string, jsonParts]) => {
    const parser = new StreamingParser();
    for (const part of jsonParts.slice(0, -1)) {
      assert.doesNotThrow(() => parser.parse(part));
      assert.deepEqual(internalGetStateRoot(parser), 'partial');
    }
    const output = parser.parse(jsonParts.at(-1)!);
    assert.deepEqual(internalGetStateRoot(parser), 'complete');
    assert.deepEqual(output, string);
  },
);

test.prop([partitionedJson])(
  'Can parse partial JSON objects',
  ([value, jsonParts]) => {
    const parser = new StreamingParser();
    let output: any;
    let prefix = '';
    for (const [idx, part] of jsonParts.entries()) {
      if (idx === jsonParts.length - 1) {
        output = parser.parseComplete(part);
      } else {
        parser.parse(part);
      }

      prefix += part;
    }

    assert.deepEqual(output, value);
  },
);

test.prop([multipleJsonObjects])(
  'Can parse multiple JSON objects',
  ([values, jsonParts]) => {
    const parser = new StreamingParser({ stream: true });
    let items: any[] = [];
    for (const part of jsonParts) {
      const output = parser.parseIncremental(part);
      for (const iterator of output.events) {
        if (iterator.kind === 'value') {
          items.push(iterator.value);
        }
      }
    }
    assert.equal(items.length, values.length);
    assert.deepEqual(items, values);
  },
);

test(`parse() - continue string with escape`, t => {
  const parser = new StreamingParser();
  assert.equal(parser.parse('"'), '');
  assert.equal(parser.parse('\\'), '');
});

test(`parse() - continue in before array value`, t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parse('["1"'), ['1']);
  assert.deepEqual(parser.parse(',"2'), ['1', '2']);
  assert.deepEqual(parser.parse('3",'), ['1', '23']);
  assert.deepEqual(parser.parse('4]'), ['1', '23', 4]);
});

test('parse() - integer', t => {
  const parser = new StreamingParser();

  assert.equal(parser.parse('-'), undefined);
  assert.equal(internalGetStateRoot(parser), 'partial');

  assert.equal(parser.parse('1'), undefined);
  assert.equal(internalGetStateRoot(parser), 'partial');

  assert.deepEqual(parser.parseComplete('2'), -12);
  assert.equal(internalGetStateRoot(parser), 'complete');
});

test('parse() - complex', t => {
  // Note: partial(v) mutates the object and adds a [parseStateSymbol] property with the value
  // 'partial', complete(v) does the same with the value 'complete'.

  const parser = new StreamingParser();
  assert.deepEqual(parser.parse('{"":["'), { '': [''] });

  assert.deepEqual(
    internalGetStateRoot(parser),
    partial({ '': partial(['partial']) }),
  );

  assert.deepEqual(parser.parse('foo'), { '': ['foo'] });
  assert.deepEqual(parser.parse('bar'), { '': ['foobar'] });
  assert.deepEqual(
    internalGetStateRoot(parser),
    partial({ '': partial(['partial']) }),
  );

  assert.deepEqual(parser.parse('"'), { '': ['foobar'] });
  assert.deepEqual(
    internalGetStateRoot(parser),
    partial({ '': partial(['complete']) }),
  );

  assert.deepEqual(parser.parse(',"baz'), { '': ['foobar', 'baz'] });
  assert.deepEqual(
    internalGetStateRoot(parser),
    partial({ '': partial(['complete', 'partial']) }),
  );

  assert.deepEqual(parser.parse('zap"]'), { '': ['foobar', 'bazzap'] });
  assert.deepEqual(
    internalGetStateRoot(parser),
    partial({ '': complete(['complete', 'complete']) }),
  );

  assert.deepEqual(parser.parseComplete('}'), { '': ['foobar', 'bazzap'] });
  assert.deepEqual(
    internalGetStateRoot(parser),
    complete({ '': complete(['complete', 'complete']) }),
  );
});

test('parser#toString()', t => {
  const parser = new StreamingParser();
  assert.deepEqual(
    // @ts-expect-error toString() is not part of the public API
    parser.toString(),
    JSON.stringify({
      pushed: false,
      endOfInput: false,
      partialLex: false,
      lexState: 'default',
      parseState: 'start',
      outputStack: [],
      stateStack: [],
      pathStack: [],
      pos: 0,
      line: 1,
      column: 0,
      source: '',
      stream: false,
      parseEvents: [],
    }),
  );
});
