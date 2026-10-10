import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromVuePackage = createRequire(
  new URL('../../../../packages/vue/package.json', import.meta.url),
);
const { JSDOM } = requireFromVuePackage('jsdom');

async function main() {
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
    (globalThis as any)[key] = dom.window[key];
  }

  const { createApp, h } = requireFromVuePackage('vue');
  const { jsonSchema } = requireFromVuePackage('ai');
  const { experimental_useObject: useObject } =
    await import('../../../../packages/vue/src/use-object');

  async function capture(headers: Record<string, string> | Headers) {
    let hook: ReturnType<typeof useObject> | undefined;
    let received: Record<string, string> | undefined;

    const app = createApp({
      setup() {
        hook = useObject({
          api: '/object',
          schema: jsonSchema({ type: 'object' }),
          headers,
          fetch: async (_url, options) => {
            received = Object.fromEntries(new Headers(options?.headers));
            return new Response('{}');
          },
        });
        return () => h('div');
      },
    });

    app.mount(document.getElementById('root')!);
    await hook!.submit({});
    app.unmount();
    return received!;
  }

  const plain = await capture({ 'x-repro-header': 'example' });
  const instance = await capture(new Headers({ 'x-repro-header': 'example' }));

  console.log({ plain, instance });
  dom.window.close();

  assert.equal(
    plain['x-repro-header'],
    'example',
    'Plain-object control did not preserve x-repro-header',
  );
  assert.equal(
    instance['x-repro-header'],
    'example',
    'BUG: Vue useObject dropped x-repro-header supplied via Headers instance',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
