import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface JSCodeshift {
  (source: string): unknown;
  withParser(parser: 'tsx'): JSCodeshift;
}

type TransformApi = {
  j: JSCodeshift;
  jscodeshift: JSCodeshift;
  stats: () => void;
  report: (message: string) => void;
};

type Transform = (
  fileInfo: { path: string; source: string },
  api: TransformApi,
  options: Record<string, never>,
) => string | null;

const jscodeshift =
  require('../../../../packages/codemod/node_modules/jscodeshift') as JSCodeshift;

type Part = {
  type: string;
  data: string;
  mediaType: string;
};

async function loadTransform(): Promise<Transform> {
  const modulePath =
    '../../../../packages/codemod/src/codemods/v7/' +
    'replace-image-message-part-with-file.ts';
  const loadedModule = (await import(modulePath)) as { default: Transform };
  return loadedModule.default;
}

function applyTransform(transform: Transform, source: string): string {
  const j = jscodeshift.withParser('tsx');
  const transformed = transform(
    { path: 'fixture.tsx', source },
    {
      j,
      jscodeshift: j,
      stats: () => {},
      report: () => {},
    },
    {},
  );

  if (transformed === null) {
    throw new Error('The image part must be transformed');
  }

  return transformed;
}

function evaluate(source: string): Part {
  return Function(`"use strict";\n${source}`)() as Part;
}

async function main() {
  const transform = await loadTransform();
  const explicit = evaluate(
    applyTransform(
      transform,
      "const image = 'fixture'; const part = { type: 'image', image: image }; return part;",
    ),
  );

  assert.deepEqual(explicit, {
    type: 'file',
    data: 'fixture',
    mediaType: 'image',
  });

  const shorthandSource =
    "const image = 'fixture'; const part = { type: 'image', image }; return part;";
  const transformedShorthand = applyTransform(transform, shorthandSource);

  let shorthandValue: Part | undefined;
  let shorthandError: unknown;
  try {
    shorthandValue = evaluate(transformedShorthand);
  } catch (error) {
    shorthandError = error;
  }

  const capturedValue = evaluate(
    applyTransform(
      transform,
      "const data = 'unrelated'; const image = 'fixture'; const part = { type: 'image', image }; return part;",
    ),
  );

  if (
    shorthandError !== undefined ||
    shorthandValue?.data !== 'fixture' ||
    capturedValue.data !== 'fixture'
  ) {
    console.error(
      'ISSUE #23013: transformed shorthand image part did not preserve the image binding',
    );
    console.error(
      JSON.stringify(
        {
          transformedShorthand,
          shorthandError:
            shorthandError instanceof Error
              ? shorthandError.message
              : shorthandError,
          shorthandValue,
          capturedValue,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Shorthand image bindings were preserved as data: image.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
