import { test } from '@fast-check/vitest';
import { StreamingParser } from '../';
import { internalGetRoot, internalGetStateRoot } from './helpers/util';
import { ExtendedSyntaxError } from './parser';

test('parse() - errors - empty documents', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parseComplete('');
    },
    ExtendedSyntaxError,
    `JSON: invalid end of input at 1:1`,
  );
});

test('parse() - errors - comment', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('/');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '\/' at 1:1`,
  );
});

test('parse() - errors - invalid characters in values', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('a');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'a' at 1:1`,
  );
});

test('parse() - errors - invalid property name', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('{\\a:1}');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '\\\\' at 1:2`,
  );
});

test('parse() - errors - escaped property names', t => {
  const parser = new StreamingParser();
  assert.throws(() =>
    parser.parseComplete(
      '{\\u0061\\u0062:1,\\u0024\\u005F:2,\\u005F\\u0024:3}',
    ),
  );
});

test('parse() - errors - invalid identifier start characters', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('{\\u0021:1}');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '\\\\' at 1:2`,
  );
});

test('parse() - errors - invalid characters following a sign', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('-a');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'a' at 1:2`,
  );
});

test('parse() - errors - invalid characters following an exponent indicator', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('1ea');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'a' at 1:3`,
  );
});

test('parse() - errors - invalid characters following an exponent sign', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('1e-a');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'a' at 1:4`,
  );
});

test('parse() - errors - invalid new lines in strings', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('"\n"');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '\\n' at 2:0`,
  );
});

test('parse() - errors - invalid identifier start characters in property names', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('{!:1}');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '!' at 1:2`,
  );
});

test('parse() - errors - invalid characters following an array value', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('[1!]');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '!' at 1:3`,
  );
});

test('parse() - errors - invalid characters in literals', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('tru!');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '!' at 1:4`,
  );
});

test('parse() - errors - unterminated escapes', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parseComplete('"\\');
    },
    ExtendedSyntaxError,
    `JSON: invalid end of input at 1:3`,
  );
});

test('parse() - errors - invalid first digits in hexadecimal escapes', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('"\\xg"');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'x' at 1:3`,
  );
});

test('parse() - errors - invalid second digits in hexadecimal escapes', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('"\\x0g"');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'x' at 1:3`,
  );
});

test('parse() - errors - invalid unicode escapes', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('"\\u000g"');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'g' at 1:7`,
  );
});

for (let i = 1; i <= 9; i++) {
  test(`parse() - errors - escaped digit ${i}`, t => {
    const parser = new StreamingParser();

    assert.throws(
      () => {
        parser.parse(`"\\${i}"`);
      },
      ExtendedSyntaxError,
      new RegExp(`^JSON: invalid character '${i}' at 1:3`),
    );
  });
}

test('parse() - errors - octal escapes', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse(`"\\01"`);
    },
    ExtendedSyntaxError,
    `JSON: invalid character '0' at 1:3`,
  );
});

test('parse() - errors - multiple values', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('1 2');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '2' at 1:3`,
  );
});

test('parse() - errors - control characters escaped in the message', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('\x01');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '\\x01' at 1:1`,
  );
});

test('parse() - unclosed objects before property names', t => {
  const parser = new StreamingParser();

  assert.deepEqual(parser.parse('{'), {});
});

test('parse() - unclosed objects after property names', t => {
  const parser = new StreamingParser();

  assert.deepEqual(parser.parse('{"a"'), {});
});

test('parse() - errors - unclosed objects before property values', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('{a:');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'a' at 1:2`,
  );
});

test('parse() - errors - unclosed objects after property values', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => {
      parser.parse('{a:1');
    },
    ExtendedSyntaxError,
    `JSON: invalid character 'a' at 1:2`,
  );
});

test('parse() - unclosed arrays before values', t => {
  const parser = new StreamingParser();

  assert.deepEqual(parser.parse('['), []);
});

test('parse() - errors - unclosed arrays after values', t => {
  const parser = new StreamingParser();

  assert.deepEqual(parser.parse('['), []);
});

test('parse() - error - number with 0', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => parser.parse('0x'),
    ExtendedSyntaxError,
    `JSON: invalid character 'x' at 1:2`,
  );
});

test('parse() - error - NaN', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => parser.parse('NaN'),
    ExtendedSyntaxError,
    `JSON: invalid character 'N' at 1:1`,
  );
});

test('parse() - Infinity', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => parser.parse('[Infinity,-Infinity]'),
    ExtendedSyntaxError,
    `JSON: invalid character 'I' at 1:2`,
  );
});

test('parse() - error - leading decimal points', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => parser.parse('[.1,.23]'),
    ExtendedSyntaxError,
    `JSON: invalid character '.' at 1:2`,
  );
});

test('parse() - error - trailing decimal points', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => parser.parse('[0.]'),
    ExtendedSyntaxError,
    `JSON: invalid character ']' at 1:4`,
  );
});

test('parse() - leading + in a number', t => {
  const parser = new StreamingParser();

  assert.throws(
    () => parser.parse('+1.23e100'),
    ExtendedSyntaxError,
    `JSON: invalid character '+' at 1:1`,
  );
});

test('parse() - error - incorrectly completed partial string', t => {
  const parser = new StreamingParser();
  assert.deepEqual(parser.parse('"abc'), 'abc');
  assert.deepEqual(internalGetStateRoot(parser), 'partial');
  assert.deepEqual(internalGetRoot(parser), 'abc');

  assert.throws(
    () => {
      parser.parse('"{}');
    },
    ExtendedSyntaxError,
    `JSON: invalid character '{' at 1:6`,
  );
});

for (const suffix of ['null', '"', '1', 'true', '{}', '[]']) {
  test(`parse() - error - incorrectly completed partial string with suffix ${JSON.stringify(
    suffix,
  )}`, t => {
    const parser = new StreamingParser();
    assert.deepEqual(parser.parse('"abc'), 'abc');
    assert.deepEqual(internalGetStateRoot(parser), 'partial');
    assert.deepEqual(internalGetRoot(parser), 'abc');

    let errorChar = suffix[0];
    if (errorChar === '"') {
      errorChar = '\\"';
    }

    assert.throws(
      () => {
        parser.parse(`"${suffix}`);
      },
      ExtendedSyntaxError,
      `JSON: invalid character '${errorChar}' at 1:6`,
    );
  });
}

for (const suffix of ['null', '"', '1', 'true', '{}', '[]']) {
  test(`parse() - error - incorrectly continued after array with suffix ${JSON.stringify(
    suffix,
  )}`, t => {
    const parser = new StreamingParser();
    assert.deepEqual(parser.parse('["1"'), ['1']);
    assert.deepEqual(parser.parse(',"2"'), ['1', '2']);

    let errorChar = suffix[0];
    if (errorChar === '"') {
      errorChar = '\\"';
    }

    assert.throws(
      () => parser.parse(`]${suffix}`),
      ExtendedSyntaxError,
      `JSON: invalid character '${errorChar}' at 1:10`,
    );
  });
}
