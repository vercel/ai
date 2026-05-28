export const HARDENING_SOURCE = `
(function() {
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

export const BRIDGE_TRACKING_SOURCE = `
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

export const TOOLS_PROXY_SOURCE = `
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

export const SERIALIZATION_GUARD_SOURCE = `
(function() {
  function assertSerializable(value) {
    if (typeof globalThis.__codeModeAssertNoDetachedBridgeCalls === 'function') {
      globalThis.__codeModeAssertNoDetachedBridgeCalls();
    }

    var seen = new WeakSet();

    function visit(current, path, isRoot) {
      if (current === undefined && isRoot) return;
      if (current === null) return;

      var type = typeof current;
      if (type === 'string' || type === 'boolean') return;
      if (type === 'number') {
        if (!Number.isFinite(current)) {
          throw new TypeError('Code mode result contains a non-finite number at ' + path + '.');
        }
        return;
      }
      if (type === 'undefined' || type === 'function' || type === 'symbol' || type === 'bigint') {
        throw new TypeError('Code mode result is not JSON-serializable at ' + path + '.');
      }
      if (type !== 'object') return;

      if (seen.has(current)) {
        throw new TypeError('Code mode result contains a circular reference at ' + path + '.');
      }
      seen.add(current);

      if (Array.isArray(current)) {
        for (var i = 0; i < current.length; i++) {
          visit(current[i], path + '[' + i + ']', false);
        }
        return;
      }

      var prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Code mode result contains a non-plain object at ' + path + '.');
      }

      var entries = Object.entries(current);
      for (var j = 0; j < entries.length; j++) {
        visit(entries[j][1], path + '.' + entries[j][0], false);
      }
    }

    visit(value, '$', true);
  }

  Object.defineProperty(globalThis, '__codeModeAssertSerializable', {
    value: assertSerializable,
    writable: false,
    configurable: false,
  });
})();
`;

export const FETCH_POLYFILL_SOURCE = `
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
(function(__codeModeInvokeTool, __codeModeFetch) {
${HARDENING_SOURCE}
${BRIDGE_TRACKING_SOURCE}
${TOOLS_PROXY_SOURCE}
${SERIALIZATION_GUARD_SOURCE}
${fetchEnabled ? FETCH_POLYFILL_SOURCE : ''}
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
