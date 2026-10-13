import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createUIMessageStreamResponse } from 'ai';

const codemodRequire = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);
const j = codemodRequire('jscodeshift').withParser('tsx');
const aiRequire = createRequire(
  new URL('../../../../packages/ai/package.json', import.meta.url),
);
const { build } = aiRequire('esbuild');

async function main() {
  const transformBuild = await build({
    entryPoints: [
      fileURLToPath(
        new URL(
          '../../../../packages/codemod/src/codemods/v5/replace-llamaindex-adapter.ts',
          import.meta.url,
        ),
      ),
    ],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const transformModule = await import(
    `data:text/javascript;base64,${Buffer.from(
      transformBuild.outputFiles[0].text,
    ).toString('base64')}`
  );
  const transform = transformModule.default;
  const { toUIMessageStream } = await import(
    new URL('../../../../packages/llamaindex/dist/index.js', import.meta.url)
      .href
  );

  const input = `
import { LlamaIndexAdapter } from 'ai';

export function POST(stream) {
  return LlamaIndexAdapter.toDataStreamResponse(stream);
}
`;

  const output =
    transform(
      { path: 'route.ts', source: input },
      { jscodeshift: j, j, report() {} },
      {},
    ) ?? input;

  console.log(output);

  async function* stream() {
    yield { delta: 'hello' };
  }

  const control = createUIMessageStreamResponse({
    stream: toUIMessageStream(stream()),
  });
  assert.ok(control instanceof Response);
  await control.text();

  const executable = output
    .replace(/^import[^;]+;\s*/gm, '')
    .replace('export function POST', 'function POST');
  const post = new Function(
    'toUIMessageStream',
    'createUIMessageStreamResponse',
    `${executable}; return POST;`,
  )(toUIMessageStream, createUIMessageStreamResponse);
  const actual = post(stream());

  console.log({
    isResponse: actual instanceof Response,
    isReadableStream: actual instanceof ReadableStream,
  });

  if (actual instanceof ReadableStream) {
    await actual.cancel();
  }

  assert.ok(
    actual instanceof Response,
    'ISSUE_23141: migrated HTTP handler must return a Response',
  );
}

await main();
