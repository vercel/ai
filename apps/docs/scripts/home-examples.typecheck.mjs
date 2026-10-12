// Displayed code is stored as strings, so the normal app type check cannot
// validate it. Check every selectable example against the workspace SDK.
// Run from the repository root: pnpm --filter ai-sdk-docs exec node scripts/home-examples.typecheck.mjs
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { CORE_EXAMPLES, providersFor } from '../lib/home/code-examples.ts';
import { UI_EXAMPLES } from '../lib/home/ui-examples.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const files = new Map();
for (const example of CORE_EXAMPLES) {
  for (const mode of ['gateway', 'provider', 'custom']) {
    for (const provider of providersFor(example.kind, mode)) {
      files.set(`${root}packages/ai/src/home-check-${example.filename}-${provider}-${mode}.ts`, example.getCode(provider, mode));
    }
  }
}
for (const example of UI_EXAMPLES) {
  files.set(`${root}packages/ai/src/home-check-${example.filename}`, example.getCode('openai', 'gateway'));
}

const options = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  baseUrl: root,
  paths: {
    ai: ['packages/ai/src/index.ts'],
    '@ai-sdk/*': ['packages/*/src/index.ts'],
    react: ['apps/docs/node_modules/@types/react/index.d.ts'],
    'react/jsx-runtime': ['apps/docs/node_modules/@types/react/jsx-runtime.d.ts'],
  },
};

// The compiler sees virtual files beside the SDK, where zod and Node types
// resolve normally. No generated source or test build is written to the repo.
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const fileExists = host.fileExists.bind(host);
host.readFile = file => files.get(file) ?? readFile(file);
host.fileExists = file => files.has(file) || fileExists(file);
const program = ts.createProgram([...files.keys()], options, host);
const diagnostics = [...files.keys()].flatMap(file => {
  const source = program.getSourceFile(file);
  return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
});
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: file => file,
    getNewLine: () => '\n',
  }));
}
console.log(`Checked ${files.size} displayed examples; ${diagnostics.length} diagnostics`);
process.exitCode = diagnostics.length ? 1 : 0;
