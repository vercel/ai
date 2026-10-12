import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const codemodRequire = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);
const aiRequire = createRequire(
  new URL('../../../../packages/ai/package.json', import.meta.url),
);

const jscodeshift = codemodRequire('jscodeshift');
const { build } = aiRequire('esbuild');

async function main() {
  const transformEntry = fileURLToPath(
    new URL(
      '../../../../packages/codemod/src/codemods/v5/replace-usechat-api-with-transport.ts',
      import.meta.url,
    ),
  );
  const transformBuild = await build({
    bundle: true,
    entryPoints: [transformEntry],
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const transformModule = await import(
    `data:text/javascript;base64,${Buffer.from(
      transformBuild.outputFiles[0].text,
    ).toString('base64')}`
  );
  const transform = transformModule.default;

  const input =
    "import { useChat } from 'ai/react'; const chat = useChat({ api: '/api/chat' });";
  const j = jscodeshift.withParser('tsx');
  const output =
    transform(
      { path: 'fixture.ts', source: input },
      {
        j,
        jscodeshift: j,
        stats() {},
        report() {},
      },
      {},
    ) ?? input;

  const reactEntry = fileURLToPath(
    new URL('../../../../packages/react/dist/index.js', import.meta.url),
  );
  const aiEntry = fileURLToPath(
    new URL('../../../../packages/ai/dist/index.js', import.meta.url),
  );

  try {
    await build({
      bundle: true,
      logLevel: 'silent',
      stdin: {
        contents: output,
        loader: 'ts',
        resolveDir: fileURLToPath(
          new URL('../../../../packages/react', import.meta.url),
        ),
      },
      alias: {
        '@ai-sdk/react': reactEntry,
        ai: aiEntry,
      },
      platform: 'browser',
      write: false,
    });
  } catch (error) {
    const messages =
      typeof error === 'object' && error != null && 'errors' in error
        ? (error.errors as Array<{ text?: string }>).map(item => item.text)
        : [];

    if (
      messages.some(
        message =>
          message?.includes('No matching export') &&
          message.includes('DefaultChatTransport') &&
          message.includes('packages/react/dist/index.js'),
      )
    ) {
      throw new Error(
        'ISSUE_23064_REPRODUCED: migrated useChat code cannot build because @ai-sdk/react does not export DefaultChatTransport',
      );
    }

    throw error;
  }
}

main();
