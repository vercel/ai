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

export function buildGuestRuntimeSetupSource(): string {
  return `
(function(__codeModeInvokeTool) {
${HARDENING_SOURCE}
${BRIDGE_TRACKING_SOURCE}
${TOOLS_PROXY_SOURCE}
${SERIALIZATION_GUARD_SOURCE}
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
