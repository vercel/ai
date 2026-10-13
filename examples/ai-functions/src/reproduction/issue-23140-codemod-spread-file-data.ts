import assert from 'node:assert/strict';

const failureSignal =
  'ISSUE_23140: migrated file chunk lost spread payload data';

type JSCodeshift = {
  withParser(parser: string): JSCodeshift;
};

type Transform = (
  fileInfo: { path: string; source: string },
  api: {
    j: JSCodeshift;
    jscodeshift: JSCodeshift;
    report(message: string): void;
    stats(name: string, quantity?: number): void;
  },
  options: object,
) => string | null;

function unwrapFunction<T>(module: unknown): T {
  let value = module;

  while (
    typeof value !== 'function' &&
    typeof value === 'object' &&
    value !== null &&
    'default' in value
  ) {
    value = value.default;
  }

  assert.equal(typeof value, 'function', 'Expected a callable module export');
  return value as T;
}

async function main() {
  const codemodRoot = new URL('../../../../packages/codemod/', import.meta.url);
  const [transformerModule, jscodeshiftModule] = await Promise.all([
    import(
      new URL('src/codemods/v5/restructure-file-stream-parts.ts', codemodRoot)
        .href
    ),
    import(new URL('node_modules/jscodeshift/index.js', codemodRoot).href),
  ]);
  const transform = unwrapFunction<Transform>(transformerModule);
  const jscodeshift = unwrapFunction<JSCodeshift>(jscodeshiftModule);
  const j = jscodeshift.withParser('tsx');
  const input =
    "const chunk = { type: 'file', mimeType: 'image/png', ...payload };";

  const output =
    transform(
      { path: 'fixture.ts', source: input },
      {
        j,
        jscodeshift: j,
        report() {},
        stats() {},
      },
      {},
    ) ?? input;

  const payload = {
    base64: 'AQI=',
    uint8Array: new Uint8Array([1, 2]),
  };
  const evaluate = (source: string) =>
    new Function('payload', `${source}; return chunk;`)(payload);

  const before = evaluate(input);
  const after = evaluate(output);
  const migratedFileData = after.file ?? after;

  console.log(`Transformed source: ${output}`);
  console.log(
    `Migrated payload: ${JSON.stringify({
      base64: migratedFileData.base64,
      uint8Array: Array.from(migratedFileData.uint8Array ?? []),
    })}`,
  );

  assert.equal(before.base64, payload.base64);
  assert.deepEqual(before.uint8Array, payload.uint8Array);
  assert.equal(migratedFileData.base64, payload.base64, failureSignal);
  assert.deepEqual(
    migratedFileData.uint8Array,
    payload.uint8Array,
    failureSignal,
  );
}

main();
