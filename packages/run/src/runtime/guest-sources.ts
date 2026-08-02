import { GUEST_SERDE_SOURCE } from './guest-serde-source.js';

const BASE64_SOURCE = `
const __runBase64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function btoa(input) {
  var output = '';
  for (var index = 0; index < input.length; index += 3) {
    var first = input.charCodeAt(index);
    var hasSecond = index + 1 < input.length;
    var hasThird = index + 2 < input.length;
    var second = hasSecond ? input.charCodeAt(index + 1) : 0;
    var third = hasThird ? input.charCodeAt(index + 2) : 0;
    if (first > 255 || second > 255 || third > 255) {
      throw new TypeError('Invalid binary string for base64 encoding.');
    }
    var bits = (first << 16) | (second << 8) | third;
    output += __runBase64Alphabet[(bits >>> 18) & 63];
    output += __runBase64Alphabet[(bits >>> 12) & 63];
    output += hasSecond ? __runBase64Alphabet[(bits >>> 6) & 63] : '=';
    output += hasThird ? __runBase64Alphabet[bits & 63] : '=';
  }
  return output;
}
function atob(input) {
  if (
    typeof input !== 'string' ||
    input.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)
  ) {
    throw new TypeError('Invalid base64 data.');
  }
  var output = '';
  for (var index = 0; index < input.length; index += 4) {
    var first = __runBase64Alphabet.indexOf(input[index]);
    var second = __runBase64Alphabet.indexOf(input[index + 1]);
    var third = input[index + 2] === '=' ? 0 : __runBase64Alphabet.indexOf(input[index + 2]);
    var fourth = input[index + 3] === '=' ? 0 : __runBase64Alphabet.indexOf(input[index + 3]);
    var bits = (first << 18) | (second << 12) | (third << 6) | fourth;
    output += String.fromCharCode((bits >>> 16) & 255);
    if (input[index + 2] !== '=') output += String.fromCharCode((bits >>> 8) & 255);
    if (input[index + 3] !== '=') output += String.fromCharCode(bits & 255);
  }
  return output;
}
`;

const HARDENING_SOURCE = `
(function() {
  try { delete globalThis.crypto; } catch {}
  if ('crypto' in globalThis) {
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      writable: false,
      configurable: false,
    });
  }
  try { delete globalThis.performance; } catch {}
  if ('performance' in globalThis) {
    Object.defineProperty(globalThis, 'performance', {
      value: undefined,
      writable: false,
      configurable: false,
    });
  }
  try { delete globalThis.SharedArrayBuffer; } catch {}
  if ('SharedArrayBuffer' in globalThis) {
    Object.defineProperty(globalThis, 'SharedArrayBuffer', {
      value: undefined,
      writable: false,
      configurable: false,
    });
  }

  Object.defineProperty(globalThis, 'eval', {
    value: undefined,
    writable: false,
    configurable: false,
  });

  const OriginalFunction = Function;
  const BlockedFunction = function() {
    throw new TypeError('Function constructor is not allowed');
  };
  BlockedFunction.prototype = OriginalFunction.prototype;

  const AsyncFunction = (async function(){}).constructor;
  const GeneratorFunction = (function*(){}).constructor;
  const AsyncGeneratorFunction = (async function*(){}).constructor;
  for (const proto of [
    OriginalFunction.prototype,
    AsyncFunction.prototype,
    GeneratorFunction.prototype,
    AsyncGeneratorFunction.prototype,
  ]) {
    Object.defineProperty(proto, 'constructor', {
      value: BlockedFunction,
      writable: false,
      configurable: false,
    });
  }
  Object.defineProperty(globalThis, 'Function', {
    value: BlockedFunction,
    writable: false,
    configurable: false,
  });

  const g = globalThis;
  const toFreeze = [
    Object, Object.prototype,
    OriginalFunction, OriginalFunction.prototype,
    AsyncFunction, AsyncFunction.prototype,
    GeneratorFunction, GeneratorFunction.prototype,
    AsyncGeneratorFunction, AsyncGeneratorFunction.prototype,
    Array, Array.prototype,
    String, String.prototype,
    Number, Number.prototype,
    g.BigInt, g.BigInt && g.BigInt.prototype,
    Boolean, Boolean.prototype,
    g.Symbol, g.Symbol && g.Symbol.prototype,
    RegExp, RegExp.prototype,
    Date, Date.prototype,
    Map, Map.prototype,
    Set, Set.prototype,
    WeakMap, WeakMap.prototype,
    WeakSet, WeakSet.prototype,
    Promise, Promise.prototype,
    ArrayBuffer, ArrayBuffer.prototype,
    g.DataView, g.DataView && g.DataView.prototype,
    JSON, Math, g.Reflect, g.Proxy,
  ];
  for (const name of [
    'Int8Array','Uint8Array','Uint8ClampedArray',
    'Int16Array','Uint16Array','Int32Array','Uint32Array',
    'Float32Array','Float64Array',
    'BigInt64Array','BigUint64Array',
  ]) {
    if (g[name]) toFreeze.push(g[name], g[name].prototype);
  }
  for (const obj of toFreeze) {
    if (obj != null) {
      try { Object.freeze(obj); } catch {}
    }
  }

  for (const name of [
    'AggregateError','Array','ArrayBuffer','BigInt','Boolean','DataView','Error',
    'EvalError','Float32Array','Float64Array','Int8Array','Int16Array','Int32Array',
    'Map','Number','Object','RangeError','ReferenceError','RegExp','Set','String',
    'SyntaxError','TypeError','Uint8Array','Uint8ClampedArray','Uint16Array',
    'Uint32Array','URIError','WeakMap','WeakSet'
  ]) {
    if (g[name] !== undefined) {
      try {
        Object.defineProperty(g, name, {
          value: g[name],
          writable: false,
          configurable: false,
        });
      } catch {}
    }
  }
})();
`;

const DETERMINISTIC_APIS_SOURCE = `
var __runResetDateNow = (function(config) {
  var OriginalDate = Date;
  var dateNowMs = Number(config && config.dateNowMs);
  if (!Number.isFinite(dateNowMs)) dateNowMs = 0;

  function resetDateNow(value) {
    var next = Number(value);
    if (Number.isFinite(next)) dateNowMs = Math.trunc(next);
  }

  function nextDateMs() {
    var value = dateNowMs;
    dateNowMs += 1;
    return value;
  }

  function RunDate() {
    if (new.target) {
      if (arguments.length === 0) return new OriginalDate(nextDateMs());
      return Reflect.construct(OriginalDate, arguments, new.target);
    }
    return new OriginalDate(nextDateMs()).toString();
  }

  Object.defineProperty(RunDate, 'prototype', {
    value: OriginalDate.prototype,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(OriginalDate.prototype, 'constructor', {
    value: RunDate,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(RunDate, 'now', {
    value: nextDateMs,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(RunDate, 'parse', {
    value: OriginalDate.parse,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(RunDate, 'UTC', {
    value: OriginalDate.UTC,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(globalThis, 'Date', {
    value: RunDate,
    writable: false,
    configurable: false,
  });

  var randomSeed = String(config && config.randomSeed || '');
  var mask64 = (1n << 64n) - 1n;

  function readSeedPart(offset, fallback) {
    var part = randomSeed.slice(offset, offset + 16);
    return /^[0-9a-fA-F]{16}$/.test(part) ? BigInt('0x' + part) : fallback;
  }

  var randomState0 = readSeedPart(0, 0x243f6a8885a308d3n);
  var randomState1 = readSeedPart(16, 0x13198a2e03707344n);
  if ((randomState0 | randomState1) === 0n) randomState1 = 0x9e3779b97f4a7c15n;

  function nextRandom64() {
    var s1 = randomState0;
    var s0 = randomState1;
    randomState0 = s0;
    s1 = (s1 ^ ((s1 << 23n) & mask64)) & mask64;
    randomState1 = (s1 ^ s0 ^ (s1 >> 17n) ^ (s0 >> 26n)) & mask64;
    return (randomState1 + s0) & mask64;
  }

  Object.defineProperty(Math, 'random', {
    value: function() {
      return Number(nextRandom64() >> 11n) / 9007199254740992;
    },
    writable: false,
    configurable: false,
  });
  return resetDateNow;
})(__runDeterminism);
`;

const BRIDGE_TRACKING_SOURCE = `
(function() {
  var nextRecordId = 0;
  var records = [];

  function detachedError(message, record) {
    var error = new Error(message);
    error.name = 'RunDetachedBridgeRequestError';
    error.code = 'RUN_DETACHED_BRIDGE_REQUEST';
    error.details = {
      id: record.id,
      kind: record.kind,
      name: record.name,
      status: record.status
    };
    return error;
  }

  Object.defineProperty(globalThis, '__runCreateBridgePromise', {
    value: function(kind, name, start) {
      var record = {
        id: ++nextRecordId,
        kind: String(kind),
        name: String(name || ''),
        observed: false,
        status: 'idle'
      };
      var promise;
      records.push(record);

      function getPromise() {
        record.observed = true;
        if (!promise) {
          record.status = 'pending';
          promise = Promise.resolve().then(start).then(
            function(value) {
              record.status = 'fulfilled';
              return value;
            },
            function(error) {
              record.status = 'rejected';
              throw error;
            }
          );
        }
        return promise;
      }

      return Object.freeze({
        then: function(onFulfilled, onRejected) {
          return getPromise().then(onFulfilled, onRejected);
        },
        catch: function(onRejected) {
          return getPromise().catch(onRejected);
        },
        finally: function(onFinally) {
          return getPromise().finally(onFinally);
        },
        get [Symbol.toStringTag]() {
          return 'Promise';
        }
      });
    },
    writable: false,
    configurable: false
  });

  Object.defineProperty(globalThis, '__runAssertNoDetachedBridgeCalls', {
    value: function() {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (!record.observed) {
          throw detachedError(
            'JavaScript runtime created an unawaited ' + record.kind + ' bridge request: ' + record.name + '.',
            record
          );
        }
        if (record.status === 'pending') {
          throw detachedError(
            'JavaScript runtime returned while a ' + record.kind + ' bridge request was still pending: ' + record.name + '.',
            record
          );
        }
      }
    },
    writable: false,
    configurable: false
  });
})();
`;

const BINDINGS_PROXY_SOURCE = `
(function(invokeBinding, bindingNamespaces) {
  function serializationError(label, error) {
    var message = error && error.message ? String(error.message) : String(error);
    var result = new TypeError(label + ': ' + message);
    result.code = 'RUN_SERIALIZATION_ERROR';
    return result;
  }

  function makeProxy(path) {
    return new Proxy(function(){}, {
      get: function(_target, prop) {
        if (prop === 'then' || typeof prop === 'symbol') return undefined;
        return makeProxy(path.concat([String(prop)]));
      },
      apply: function(_target, _thisArg, args) {
        var bindingPath = path.join('.');
        if (!bindingPath) throw new Error('Binding path missing in invocation');
        var callSiteStack = new Error().stack;
        var inputJson;
        try {
          inputJson = __runSerdeBundle.serializeRunValue(args);
        } catch (error) {
          throw serializationError('Binding arguments are not serializable', error);
        }
        return globalThis.__runCreateBridgePromise('binding', bindingPath, async function() {
          var resultJson;
          try {
            resultJson = await invokeBinding(bindingPath, inputJson);
          } catch (error) {
            try { error.stack = callSiteStack; } catch {}
            throw error;
          }
          try {
            return __runSerdeBundle.deserializeRunValue(resultJson);
          } catch (error) {
            throw serializationError('Binding result is invalid run-js-v1 data', error);
          }
        });
      }
    });
  }

  for (var i = 0; i < bindingNamespaces.length; i++) {
    var namespace = bindingNamespaces[i];
    Object.defineProperty(globalThis, namespace, {
      value: makeProxy([namespace]),
      writable: false,
      configurable: false
    });
  }
})(__runInvokeBinding, __runBindingNamespaces);
`;

const SERIALIZATION_GUARD_SOURCE = `
(function() {
  function serializeValuePayload(value) {
    if (typeof globalThis.__runAssertNoDetachedBridgeCalls === 'function') {
      globalThis.__runAssertNoDetachedBridgeCalls();
    }

    var encoded;
    try {
      encoded = __runSerdeBundle.serializeRunValue(value);
    } catch (error) {
      var message = error && error.message ? String(error.message) : String(error);
      var serializationError = new TypeError('JavaScript runtime result is not serializable: ' + message);
      serializationError.code = 'RUN_SERIALIZATION_ERROR';
      throw serializationError;
    }

    if (encoded === undefined) {
      var serializationError = new TypeError('JavaScript runtime result is not serializable.');
      serializationError.code = 'RUN_SERIALIZATION_ERROR';
      throw serializationError;
    }

    return encoded;
  }

  Object.defineProperty(globalThis, '__runSerializeJsonPayload', {
    value: serializeValuePayload,
    writable: false,
    configurable: false,
  });
})();
`;

export function buildGuestRuntimeSetupSource(
  bindingNamespaces: string[],
): string {
  const namespacesJson = JSON.stringify(bindingNamespaces);
  return `
(function(__runInvokeBinding, __runDeterminism) {
const __runBindingNamespaces = ${namespacesJson};
${DETERMINISTIC_APIS_SOURCE}
${BASE64_SOURCE}
${GUEST_SERDE_SOURCE}
${HARDENING_SOURCE}
${BRIDGE_TRACKING_SOURCE}
${BINDINGS_PROXY_SOURCE}
${SERIALIZATION_GUARD_SOURCE}
return Object.freeze({ resetDateNow: __runResetDateNow });
})
`;
}

export function wrapUserCode(js: string): string {
  return `
globalThis.__runResult = (async () => {
${js}
})();
`;
}
