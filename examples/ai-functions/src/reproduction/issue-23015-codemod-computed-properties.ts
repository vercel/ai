import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

async function main() {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
  const codemodRoot = resolve(repositoryRoot, 'packages/codemod');
  const requireFromCodemod = createRequire(
    resolve(codemodRoot, 'package.json'),
  );
  const jscodeshift = requireFromCodemod('jscodeshift');
  const j = jscodeshift.withParser('tsx');
  const { default: transform } = await import(
    pathToFileURL(
      resolve(codemodRoot, 'src/codemods/v7/rename-system-to-instructions.ts'),
    ).href
  );

  const applyTransform = (source: string): string =>
    transform(
      { path: 'fixture.ts', source },
      {
        j,
        jscodeshift: j,
        report() {},
        stats() {},
      },
      {},
    ) ?? source;

  const evaluate = (source: string, options = {}) =>
    runInNewContext(source, { options });

  const controls = [
    {
      source: 'options.system;',
      options: { instructions: 'text' },
      expected: 'text',
    },
    {
      source: "options['system'];",
      options: { instructions: 'text' },
      expected: 'text',
    },
    {
      source: "({ system: 'text' }).instructions;",
      expected: 'text',
    },
    {
      source: "({ ['system']: 'text' }).instructions;",
      expected: 'text',
    },
    {
      source: "const { system: value } = { instructions: 'text' }; value;",
      expected: 'text',
    },
    {
      source: "const { ['system']: value } = { instructions: 'text' }; value;",
      expected: 'text',
    },
  ];

  for (const control of controls) {
    assert.equal(
      evaluate(applyTransform(control.source), control.options),
      control.expected,
      `static system property was not migrated: ${control.source}`,
    );
  }

  const dynamicCases = [
    {
      name: 'member expression',
      source: "const system = 'custom'; options[system];",
      options: { custom: 'retained' },
    },
    {
      name: 'object expression key',
      source: "const system = 'custom'; ({ [system]: 'retained' }).custom;",
    },
    {
      name: 'object pattern key',
      source:
        "const system = 'custom'; const { [system]: value } = options; value;",
      options: { custom: 'retained' },
    },
  ];

  const failures: string[] = [];

  for (const dynamicCase of dynamicCases) {
    assert.equal(
      evaluate(dynamicCase.source, dynamicCase.options),
      'retained',
      `invalid reproduction setup for ${dynamicCase.name}`,
    );

    const transformed = applyTransform(dynamicCase.source);

    try {
      const value = evaluate(transformed, dynamicCase.options);
      if (value !== 'retained') {
        failures.push(
          `${dynamicCase.name}: returned ${JSON.stringify(value)} after ${JSON.stringify(transformed)}`,
        );
      }
    } catch (error) {
      failures.push(
        `${dynamicCase.name}: ${error instanceof Error ? error.message : String(error)} after ${JSON.stringify(transformed)}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_23015: rename-system-to-instructions breaks computed variable property lookups',
    );
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
