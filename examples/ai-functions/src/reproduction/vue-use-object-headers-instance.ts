import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { jsonSchema } from 'ai';

const require = createRequire(import.meta.url);
const { JSDOM } = require('../../../../packages/vue/node_modules/jsdom');
const useObjectModulePath = '../../../../packages/vue/src/use-object';
const dom = new JSDOM('<div id="root"></div>', {
  url: 'http://localhost',
});

for (const key of [
  'window',
  'document',
  'HTMLElement',
  'Element',
  'SVGElement',
] as const) {
  Object.assign(globalThis, { [key]: dom.window[key] });
}

const { createApp, h } = require('../../../../packages/vue/node_modules/vue');

async function capture(headers: Record<string, string> | Headers) {
  const { experimental_useObject } = await import(useObjectModulePath);
  let object:
    | {
        submit(input: unknown): Promise<void> | void;
      }
    | undefined;
  let received: Record<string, string> | undefined;
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp({
    setup() {
      object = experimental_useObject({
        api: '/object',
        schema: jsonSchema({ type: 'object' }),
        headers,
        fetch: async (_url: RequestInfo | URL, options?: RequestInit) => {
          received = {};
          new Headers(options?.headers).forEach((value, key) => {
            received![key] = value;
          });
          return new Response('{}');
        },
      });
      return () => h('div');
    },
  });
  app.mount(root);

  assert.ok(object);
  await object.submit({});
  app.unmount();
  root.remove();
  assert.ok(received);
  return received;
}

async function main() {
  const plain = await capture({ 'x-repro-header': 'example' });
  const instance = await capture(new Headers({ 'x-repro-header': 'example' }));

  console.log({ plain, instance });
  assert.equal(plain['x-repro-header'], 'example');
  assert.equal(
    instance['x-repro-header'],
    'example',
    'BUG: Vue useObject dropped x-repro-header from Headers instance',
  );
  dom.window.close();
}

main();
