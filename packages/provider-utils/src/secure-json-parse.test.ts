// Licensed under BSD-3-Clause (this file only)
// Code adapted from https://github.com/fastify/secure-json-parse/blob/783fcb1b5434709466759847cec974381939673a/test/index.test.js
//
// Copyright (c) Vercel, Inc. (https://vercel.com)
// Copyright (c) 2019 The Fastify Team
// Copyright (c) 2019, Sideway Inc, and project contributors
// All rights reserved.
//
// The complete list of contributors can be found at:
// - https://github.com/hapijs/bourne/graphs/contributors
// - https://github.com/fastify/secure-json-parse/graphs/contributors
// - https://github.com/vercel/ai/commits/main/packages/provider-utils/src/secure-parse-json.test.ts
//
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import { describe, it, expect } from 'vitest';
import { secureJsonParse } from './secure-json-parse';

('use strict');

const { test } = require('tape');
const j = require('..');

test('parse', t => {
  t.test('parses object string', t => {
    t.deepEqual(j.parse('{"a": 5, "b": 6}'), JSON.parse('{"a": 5, "b": 6}'));
    t.end();
  });

  t.test('parses null string', t => {
    t.strictEqual(j.parse('null'), JSON.parse('null'));
    t.end();
  });

  t.test('parses 0 string', t => {
    t.strictEqual(j.parse('0'), JSON.parse('0'));
    t.end();
  });

  t.test('parses string string', t => {
    t.strictEqual(j.parse('"X"'), JSON.parse('"X"'));
    t.end();
  });

  t.test('parses buffer', t => {
    t.strictEqual(j.parse(Buffer.from('"X"')), JSON.parse(Buffer.from('"X"')));
    t.end();
  });

  t.test('parses object string (reviver)', t => {
    const reviver = (_key, value) => {
      return typeof value === 'number' ? value + 1 : value;
    };

    t.deepEqual(
      j.parse('{"a": 5, "b": 6}', reviver),
      JSON.parse('{"a": 5, "b": 6}', reviver),
    );
    t.end();
  });

  t.test('protoAction', t => {
    t.test('sanitizes object string (reviver, options)', t => {
      const reviver = (_key, value) => {
        return typeof value === 'number' ? value + 1 : value;
      };

      t.deepEqual(
        j.parse('{"a": 5, "b": 6,"__proto__": { "x": 7 }}', reviver, {
          protoAction: 'remove',
        }),
        { a: 6, b: 7 },
      );
      t.end();
    });

    t.test('sanitizes object string (options)', t => {
      t.deepEqual(
        j.parse('{"a": 5, "b": 6,"__proto__": { "x": 7 }}', {
          protoAction: 'remove',
        }),
        { a: 5, b: 6 },
      );
      t.end();
    });

    t.test('sanitizes object string (null, options)', t => {
      t.deepEqual(
        j.parse('{"a": 5, "b": 6,"__proto__": { "x": 7 }}', null, {
          protoAction: 'remove',
        }),
        { a: 5, b: 6 },
      );
      t.end();
    });

    t.test('sanitizes object string (null, options)', t => {
      t.deepEqual(
        j.parse('{"a": 5, "b": 6,"__proto__": { "x": 7 }}', {
          protoAction: 'remove',
        }),
        { a: 5, b: 6 },
      );
      t.end();
    });

    t.test('sanitizes nested object string', t => {
      t.deepEqual(
        j.parse(
          '{ "a": 5, "b": 6, "__proto__": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }',
          { protoAction: 'remove' },
        ),
        { a: 5, b: 6, c: { d: 0, e: 'text', f: { g: 2 } } },
      );
      t.end();
    });

    t.test('ignores proto property', t => {
      t.deepEqual(
        j.parse('{ "a": 5, "b": 6, "__proto__": { "x": 7 } }', {
          protoAction: 'ignore',
        }),
        JSON.parse('{ "a": 5, "b": 6, "__proto__": { "x": 7 } }'),
      );
      t.end();
    });

    t.test('ignores proto value', t => {
      t.deepEqual(j.parse('{"a": 5, "b": "__proto__"}'), {
        a: 5,
        b: '__proto__',
      });
      t.end();
    });

    t.test('errors on proto property', t => {
      t.throws(
        () => j.parse('{ "a": 5, "b": 6, "__proto__": { "x": 7 } }'),
        SyntaxError,
      );
      t.throws(
        () => j.parse('{ "a": 5, "b": 6, "__proto__" : { "x": 7 } }'),
        SyntaxError,
      );
      t.throws(
        () => j.parse('{ "a": 5, "b": 6, "__proto__" \n\r\t : { "x": 7 } }'),
        SyntaxError,
      );
      t.throws(
        () => j.parse('{ "a": 5, "b": 6, "__proto__" \n \r \t : { "x": 7 } }'),
        SyntaxError,
      );
      t.end();
    });

    t.test('errors on proto property (null, null)', t => {
      t.throws(
        () =>
          j.parse('{ "a": 5, "b": 6, "__proto__": { "x": 7 } }', null, null),
        SyntaxError,
      );
      t.end();
    });

    t.test('errors on proto property (explicit options)', t => {
      t.throws(
        () =>
          j.parse('{ "a": 5, "b": 6, "__proto__": { "x": 7 } }', {
            protoAction: 'error',
          }),
        SyntaxError,
      );
      t.end();
    });

    t.test('errors on proto property (unicode)', t => {
      t.throws(
        () => j.parse('{ "a": 5, "b": 6, "\\u005f_proto__": { "x": 7 } }'),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse('{ "a": 5, "b": 6, "_\\u005fp\\u0072oto__": { "x": 7 } }'),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "\\u005f\\u005f\\u0070\\u0072\\u006f\\u0074\\u006f\\u005f\\u005f": { "x": 7 } }',
          ),
        SyntaxError,
      );
      t.throws(
        () => j.parse('{ "a": 5, "b": 6, "\\u005F_proto__": { "x": 7 } }'),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse('{ "a": 5, "b": 6, "_\\u005Fp\\u0072oto__": { "x": 7 } }'),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "\\u005F\\u005F\\u0070\\u0072\\u006F\\u0074\\u006F\\u005F\\u005F": { "x": 7 } }',
          ),
        SyntaxError,
      );
      t.end();
    });

    t.test('should reset stackTraceLimit', t => {
      const text =
        '{ "a": 5, "b": 6, "__proto__": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';
      Error.stackTraceLimit = 42;
      t.throws(() => j.parse(text));
      t.same(Error.stackTraceLimit, 42);
      t.end();
    });

    t.end();
  });

  t.test('constructorAction', t => {
    t.test('sanitizes object string (reviver, options)', t => {
      const reviver = (_key, value) => {
        return typeof value === 'number' ? value + 1 : value;
      };

      t.deepEqual(
        j.parse(
          '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}} }',
          reviver,
          { constructorAction: 'remove' },
        ),
        { a: 6, b: 7 },
      );
      t.end();
    });

    t.test('sanitizes object string (options)', t => {
      t.deepEqual(
        j.parse(
          '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}} }',
          { constructorAction: 'remove' },
        ),
        { a: 5, b: 6 },
      );
      t.end();
    });

    t.test('sanitizes object string (null, options)', t => {
      t.deepEqual(
        j.parse(
          '{"a": 5, "b": 6,"constructor":{"prototype":{"bar":"baz"}} }',
          null,
          { constructorAction: 'remove' },
        ),
        { a: 5, b: 6 },
      );
      t.end();
    });

    t.test('sanitizes object string (null, options)', t => {
      t.deepEqual(
        j.parse('{"a": 5, "b": 6,"constructor":{"prototype":{"bar":"baz"}} }', {
          constructorAction: 'remove',
        }),
        { a: 5, b: 6 },
      );
      t.end();
    });

    t.test('sanitizes object string (no prototype key)', t => {
      t.deepEqual(
        j.parse('{"a": 5, "b": 6,"constructor":{"bar":"baz"} }', {
          constructorAction: 'remove',
        }),
        { a: 5, b: 6, constructor: { bar: 'baz' } },
      );
      t.end();
    });

    t.test('sanitizes nested object string', t => {
      t.deepEqual(
        j.parse(
          '{ "a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "c": { "d": 0, "e": "text", "constructor":{"prototype":{"bar":"baz"}}, "f": { "g": 2 } } }',
          { constructorAction: 'remove' },
        ),
        { a: 5, b: 6, c: { d: 0, e: 'text', f: { g: 2 } } },
      );
      t.end();
    });

    t.test('ignores proto property', t => {
      t.deepEqual(
        j.parse(
          '{ "a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}} }',
          { constructorAction: 'ignore' },
        ),
        JSON.parse(
          '{ "a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}} }',
        ),
      );
      t.end();
    });

    t.test('ignores proto value', t => {
      t.deepEqual(j.parse('{"a": 5, "b": "constructor"}'), {
        a: 5,
        b: 'constructor',
      });
      t.end();
    });

    t.test('errors on proto property', t => {
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "constructor": {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "constructor" : {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "constructor" \n\r\t : {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "constructor" \n \r \t : {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.end();
    });

    t.test(
      "Should not throw if the constructor key hasn't a child named prototype",
      t => {
        t.doesNotThrow(
          () =>
            j.parse(
              '{ "a": 5, "b": 6, "constructor":{"bar":"baz"} }',
              null,
              null,
            ),
          SyntaxError,
        );
        t.end();
      },
    );

    t.test('errors on proto property (null, null)', t => {
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}} }',
            null,
            null,
          ),
        SyntaxError,
      );
      t.end();
    });

    t.test('errors on proto property (explicit options)', t => {
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}} }',
            { constructorAction: 'error' },
          ),
        SyntaxError,
      );
      t.end();
    });

    t.test('errors on proto property (unicode)', t => {
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "\\u0063\\u006fnstructor": {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "\\u0063\\u006f\\u006e\\u0073\\u0074ructor": {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "\\u0063\\u006f\\u006e\\u0073\\u0074\\u0072\\u0075\\u0063\\u0074\\u006f\\u0072": {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "\\u0063\\u006Fnstructor": {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.throws(
        () =>
          j.parse(
            '{ "a": 5, "b": 6, "\\u0063\\u006F\\u006E\\u0073\\u0074\\u0072\\u0075\\u0063\\u0074\\u006F\\u0072": {"prototype":{"bar":"baz"}} }',
          ),
        SyntaxError,
      );
      t.end();
    });

    t.end();
  });

  t.test('protoAction and constructorAction', t => {
    t.test('protoAction=remove constructorAction=remove', t => {
      t.deepEqual(
        j.parse(
          '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "__proto__": { "x": 7 } }',
          { protoAction: 'remove', constructorAction: 'remove' },
        ),
        { a: 5, b: 6 },
      );
      t.end();
    });

    t.test('protoAction=ignore constructorAction=remove', t => {
      t.deepEqual(
        j.parse(
          '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "__proto__": { "x": 7 } }',
          { protoAction: 'ignore', constructorAction: 'remove' },
        ),
        JSON.parse('{ "a": 5, "b": 6, "__proto__": { "x": 7 } }'),
      );
      t.end();
    });

    t.test('protoAction=remove constructorAction=ignore', t => {
      t.deepEqual(
        j.parse(
          '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "__proto__": { "x": 7 } }',
          { protoAction: 'remove', constructorAction: 'ignore' },
        ),
        JSON.parse(
          '{ "a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}} }',
        ),
      );
      t.end();
    });

    t.test('protoAction=ignore constructorAction=ignore', t => {
      t.deepEqual(
        j.parse(
          '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "__proto__": { "x": 7 } }',
          { protoAction: 'ignore', constructorAction: 'ignore' },
        ),
        JSON.parse(
          '{ "a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "__proto__": { "x": 7 } }',
        ),
      );
      t.end();
    });

    t.test('protoAction=error constructorAction=ignore', t => {
      t.throws(
        () =>
          j.parse(
            '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "__proto__": { "x": 7 } }',
            { protoAction: 'error', constructorAction: 'ignore' },
          ),
        SyntaxError,
      );
      t.end();
    });

    t.test('protoAction=ignore constructorAction=error', t => {
      t.throws(
        () =>
          j.parse(
            '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "__proto__": { "x": 7 } }',
            { protoAction: 'ignore', constructorAction: 'error' },
          ),
        SyntaxError,
      );
      t.end();
    });

    t.test('protoAction=error constructorAction=error', t => {
      t.throws(
        () =>
          j.parse(
            '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}}, "__proto__": { "x": 7 } }',
            { protoAction: 'error', constructorAction: 'error' },
          ),
        SyntaxError,
      );
      t.end();
    });

    t.end();
  });

  t.test('sanitizes nested object string', t => {
    const text =
      '{ "a": 5, "b": 6, "__proto__": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';

    const obj = j.parse(text, { protoAction: 'remove' });
    t.deepEqual(obj, { a: 5, b: 6, c: { d: 0, e: 'text', f: { g: 2 } } });
    t.end();
  });

  t.test('errors on constructor property', t => {
    const text =
      '{ "a": 5, "b": 6, "constructor": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';

    t.throws(() => j.parse(text), SyntaxError);
    t.end();
  });

  t.test('errors on proto property', t => {
    const text =
      '{ "a": 5, "b": 6, "__proto__": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';

    t.throws(() => j.parse(text), SyntaxError);
    t.end();
  });

  t.test('errors on constructor property', t => {
    const text =
      '{ "a": 5, "b": 6, "constructor": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';

    t.throws(() => j.parse(text), SyntaxError);
    t.end();
  });

  t.test('does not break when hasOwnProperty is overwritten', t => {
    const text =
      '{ "a": 5, "b": 6, "hasOwnProperty": "text", "__proto__": { "x": 7 } }';

    const obj = j.parse(text, { protoAction: 'remove' });
    t.deepEqual(obj, { a: 5, b: 6, hasOwnProperty: 'text' });
    t.end();
  });
  t.end();
});

test('safeParse', t => {
  t.test('parses buffer', t => {
    t.strictEqual(
      j.safeParse(Buffer.from('"X"')),
      JSON.parse(Buffer.from('"X"')),
    );
    t.end();
  });

  t.test('should reset stackTraceLimit', t => {
    const text =
      '{ "a": 5, "b": 6, "__proto__": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';
    Error.stackTraceLimit = 42;
    t.same(j.safeParse(text), null);
    t.same(Error.stackTraceLimit, 42);
    t.end();
  });

  t.test('sanitizes nested object string', t => {
    const text =
      '{ "a": 5, "b": 6, "__proto__": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';

    t.same(j.safeParse(text), null);
    t.end();
  });

  t.test('returns null on constructor property', t => {
    const text =
      '{ "a": 5, "b": 6, "constructor": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';

    t.same(j.safeParse(text), null);
    t.end();
  });

  t.test('returns null on proto property', t => {
    const text =
      '{ "a": 5, "b": 6, "__proto__": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';

    t.same(j.safeParse(text), null);
    t.end();
  });

  t.test('returns null on constructor property', t => {
    const text =
      '{ "a": 5, "b": 6, "constructor": { "x": 7 }, "c": { "d": 0, "e": "text", "__proto__": { "y": 8 }, "f": { "g": 2 } } }';

    t.same(j.safeParse(text), null);
    t.end();
  });

  t.test('parses object string', t => {
    t.deepEqual(j.safeParse('{"a": 5, "b": 6}'), { a: 5, b: 6 });
    t.end();
  });

  t.test('returns null on proto object string', t => {
    t.strictEqual(
      j.safeParse('{ "a": 5, "b": 6, "__proto__": { "x": 7 } }'),
      null,
    );
    t.end();
  });

  t.test('returns undefined on invalid object string', t => {
    t.strictEqual(j.safeParse('{"a": 5, "b": 6'), undefined);
    t.end();
  });

  t.test('sanitizes object string (options)', t => {
    t.deepEqual(
      j.safeParse(
        '{"a": 5, "b": 6, "constructor":{"prototype":{"bar":"baz"}} }',
      ),
      null,
    );
    t.end();
  });

  t.test('sanitizes object string (no prototype key)', t => {
    t.deepEqual(j.safeParse('{"a": 5, "b": 6,"constructor":{"bar":"baz"} }'), {
      a: 5,
      b: 6,
      constructor: { bar: 'baz' },
    });
    t.end();
  });

  t.end();
});

test('parse string with BOM', t => {
  const theJson = { hello: 'world' };
  const buffer = Buffer.concat([
    Buffer.from([239, 187, 191]), // the utf8 BOM
    Buffer.from(JSON.stringify(theJson)),
  ]);
  t.deepEqual(j.parse(buffer.toString()), theJson);
  t.end();
});

test('parse buffer with BOM', t => {
  const theJson = { hello: 'world' };
  const buffer = Buffer.concat([
    Buffer.from([239, 187, 191]), // the utf8 BOM
    Buffer.from(JSON.stringify(theJson)),
  ]);
  t.deepEqual(j.parse(buffer), theJson);
  t.end();
});

test('safeParse string with BOM', t => {
  const theJson = { hello: 'world' };
  const buffer = Buffer.concat([
    Buffer.from([239, 187, 191]), // the utf8 BOM
    Buffer.from(JSON.stringify(theJson)),
  ]);
  t.deepEqual(j.safeParse(buffer.toString()), theJson);
  t.end();
});

test('safeParse buffer with BOM', t => {
  const theJson = { hello: 'world' };
  const buffer = Buffer.concat([
    Buffer.from([239, 187, 191]), // the utf8 BOM
    Buffer.from(JSON.stringify(theJson)),
  ]);
  t.deepEqual(j.safeParse(buffer), theJson);
  t.end();
});

test('scan handles optional options', t => {
  t.doesNotThrow(() => j.scan({ a: 'b' }));
  t.end();
});
