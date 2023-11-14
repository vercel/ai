const { TextEncoder, TextDecoder } = require('node:util');

Reflect.set(globalThis, 'TextEncoder', TextEncoder);
Reflect.set(globalThis, 'TextDecoder', TextDecoder);

const { Blob } = require('node:buffer');
const {
  fetch,
  Request,
  Response,
  Headers,
  FormData,
  ReadableStream,
} = require('undici');

Reflect.set(globalThis, 'fetch', fetch);
Reflect.set(globalThis, 'Blob', Blob);
Reflect.set(globalThis, 'Request', Request);
Reflect.set(globalThis, 'Response', Response);
Reflect.set(globalThis, 'Headers', Headers);
Reflect.set(globalThis, 'FormData', FormData);
Reflect.set(globalThis, 'ReadableStream', ReadableStream);
