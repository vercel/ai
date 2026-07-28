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
})();
`;

const DETERMINISTIC_APIS_SOURCE = `
var __codeModeResetDateNow = (function(config) {
  var OriginalDate = Date;
  var dateNowMs = Number(config && config.dateNowMs);
  if (!Number.isFinite(dateNowMs)) dateNowMs = 0;

  function resetDateNow(value) {
    var next = Number(value);
    if (Number.isFinite(next)) {
      dateNowMs = Math.trunc(next);
    }
  }

  function nextDateMs() {
    var value = dateNowMs;
    dateNowMs += 1;
    return value;
  }

  function CodeModeDate() {
    if (new.target) {
      if (arguments.length === 0) {
        return new OriginalDate(nextDateMs());
      }
      return Reflect.construct(OriginalDate, arguments, new.target);
    }
    return new OriginalDate(nextDateMs()).toString();
  }

  Object.defineProperty(CodeModeDate, 'prototype', {
    value: OriginalDate.prototype,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(OriginalDate.prototype, 'constructor', {
    value: CodeModeDate,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(CodeModeDate, 'now', {
    value: nextDateMs,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(CodeModeDate, 'parse', {
    value: OriginalDate.parse,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(CodeModeDate, 'UTC', {
    value: OriginalDate.UTC,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(globalThis, 'Date', {
    value: CodeModeDate,
    writable: false,
    configurable: false,
  });

  var randomSeed = String(config && config.randomSeed || '');
  var mask64 = (1n << 64n) - 1n;

  function readSeedPart(offset, fallback) {
    var part = randomSeed.slice(offset, offset + 16);
    if (!/^[0-9a-fA-F]{16}$/.test(part)) {
      return fallback;
    }
    return BigInt('0x' + part);
  }

  var randomState0 = readSeedPart(0, 0x243f6a8885a308d3n);
  var randomState1 = readSeedPart(16, 0x13198a2e03707344n);
  if ((randomState0 | randomState1) === 0n) {
    randomState1 = 0x9e3779b97f4a7c15n;
  }

  function nextRandom64() {
    var s1 = randomState0;
    var s0 = randomState1;
    randomState0 = s0;
    s1 = (s1 ^ ((s1 << 23n) & mask64)) & mask64;
    randomState1 = (s1 ^ s0 ^ (s1 >> 17n) ^ (s0 >> 26n)) & mask64;
    return (randomState1 + s0) & mask64;
  }

  function deterministicRandom() {
    return Number(nextRandom64() >> 11n) / 9007199254740992;
  }

  Object.defineProperty(Math, 'random', {
    value: deterministicRandom,
    writable: false,
    configurable: false,
  });
  return resetDateNow;
})(__codeModeDeterminism);
`;

const BRIDGE_TRACKING_SOURCE = `
(function() {
  var nextRecordId = 0;
  var records = [];

  function detachedError(message, record) {
    var error = new Error(message);
    error.name = 'CodeModeDetachedBridgeRequestError';
    error.code = 'CODE_MODE_DETACHED_BRIDGE_REQUEST';
    error.details = {
      id: record.id,
      kind: record.kind,
      name: record.name,
      status: record.status
    };
    return error;
  }

  Object.defineProperty(globalThis, '__codeModeCreateBridgePromise', {
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

  Object.defineProperty(globalThis, '__codeModeAssertNoDetachedBridgeCalls', {
    value: function() {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (!record.observed) {
          throw detachedError(
            'Code mode created an unawaited ' + record.kind + ' bridge request: ' + record.name + '.',
            record
          );
        }
        if (record.status === 'pending') {
          throw detachedError(
            'Code mode returned while a ' + record.kind + ' bridge request was still pending: ' + record.name + '.',
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

const TOOLS_PROXY_SOURCE = `
(function(invokeTool) {
  globalThis.tools = (function makeProxy(path) {
    return new Proxy(function(){}, {
      get: function(_target, prop) {
        if (prop === 'then' || typeof prop === 'symbol') return undefined;
        return makeProxy(path.concat([String(prop)]));
      },
      apply: function(_target, _thisArg, args) {
        var toolPath = path.join('.');
        if (!toolPath) throw new Error('Tool path missing in invocation');
        var inputJson = args.length > 0 ? JSON.stringify(args[0]) : '';
        if (inputJson === undefined) {
          throw new Error('Tool input must be JSON-serializable');
        }
        return globalThis.__codeModeCreateBridgePromise('tool', toolPath, async function() {
          var resultJson = await invokeTool(toolPath, inputJson);
          return resultJson === '' ? undefined : JSON.parse(resultJson);
        });
      }
    });
  })([]);
})(__codeModeInvokeTool);
`;

const SERIALIZATION_GUARD_SOURCE = `
(function() {
  function serializeJsonPayload(value) {
    if (typeof globalThis.__codeModeAssertNoDetachedBridgeCalls === 'function') {
      globalThis.__codeModeAssertNoDetachedBridgeCalls();
    }

    if (value === undefined) {
      return '';
    }

    var encoded;
    try {
      encoded = JSON.stringify(value);
    } catch (error) {
      var message = error && error.message ? String(error.message) : String(error);
      throw new TypeError('Code mode result is not JSON-serializable: ' + message);
    }

    if (encoded === undefined) {
      throw new TypeError('Code mode result is not JSON-serializable.');
    }

    return encoded;
  }

  Object.defineProperty(globalThis, '__codeModeSerializeJsonPayload', {
    value: serializeJsonPayload,
    writable: false,
    configurable: false,
  });
})();
`;

const FETCH_POLYFILL_SOURCE = `
(function(hostFetch) {
  globalThis.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : String(input && input.url || input);
    init = init || {};
    var headers = {};
    if (init.headers) {
      if (Array.isArray(init.headers)) {
        for (var i = 0; i < init.headers.length; i++) {
          headers[String(init.headers[i][0])] = String(init.headers[i][1]);
        }
      } else {
        for (var key in init.headers) headers[String(key)] = String(init.headers[key]);
      }
    }
    var payload = {
      url: url,
      method: init.method,
      headers: headers,
      body: init.body == null ? undefined : String(init.body)
    };
    var requestJson = JSON.stringify(payload);
    return globalThis.__codeModeCreateBridgePromise('fetch', url, async function() {
      var responseJson = await hostFetch(requestJson);
      var data = JSON.parse(responseJson);
      var headerMap = data.headers || {};
      return {
        ok: data.status >= 200 && data.status < 300,
        status: data.status,
        statusText: data.statusText || '',
        url: data.url || url,
        headers: {
          get: function(name) {
            return headerMap[String(name).toLowerCase()] || null;
          },
          entries: function() {
            return Object.entries(headerMap)[Symbol.iterator]();
          }
        },
        text: async function() { return data.body; },
        json: async function() { return JSON.parse(data.body); },
        arrayBuffer: async function() {
          var text = data.body;
          var buffer = new ArrayBuffer(text.length);
          var view = new Uint8Array(buffer);
          for (var i = 0; i < text.length; i++) view[i] = text.charCodeAt(i) & 255;
          return buffer;
        }
      };
    });
  };
})(__codeModeFetch);
`;

export function buildGuestRuntimeSetupSource(fetchEnabled: boolean): string {
  return `
(function(__codeModeInvokeTool, __codeModeFetch, __codeModeDeterminism) {
${DETERMINISTIC_APIS_SOURCE}
${HARDENING_SOURCE}
${BRIDGE_TRACKING_SOURCE}
${TOOLS_PROXY_SOURCE}
${SERIALIZATION_GUARD_SOURCE}
${fetchEnabled ? FETCH_POLYFILL_SOURCE : ''}
return Object.freeze({
  resetDateNow: __codeModeResetDateNow,
});
})
`;
}

export function wrapUserCode(js: string): string {
  return `
globalThis.__codeModeResult = (async () => {
${js}
})();
`;
}
