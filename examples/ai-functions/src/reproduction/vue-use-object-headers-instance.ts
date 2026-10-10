import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { jsonSchema } from 'ai';

const require = createRequire(import.meta.url);
const { effectScope } = require('../../../../packages/vue/node_modules/vue');
const useObjectModulePath = '../../../../packages/vue/src/use-object.ts';

async function capture(headers: Record<string, string> | Headers) {
  const { useObject } = await import(useObjectModulePath);
  let received: Record<string, string> | undefined;
  const scope = effectScope();
  const hook = scope.run(() =>
    useObject({
      api: '/object',
      schema: jsonSchema({ type: 'object' }),
      headers,
      fetch: async (_url: RequestInfo | URL, options?: RequestInit) => {
        received = Object.fromEntries(new Headers(options?.headers));
        return new Response('{}');
      },
    }),
  );

  assert.ok(hook);
  await hook.submit({});
  scope.stop();
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
}

main();
