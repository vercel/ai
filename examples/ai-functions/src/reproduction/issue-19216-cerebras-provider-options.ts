import path from 'node:path';
import ts from 'typescript';

const issueSignal =
  'Reproduced issue #19216: documented Cerebras provider options are not publicly type-checkable.';

const probeSource = `
import type { CerebrasLanguageModelChatOptions } from '@ai-sdk/cerebras';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;

type ExpectedServiceTier = Expect<
  Equal<
    NonNullable<CerebrasLanguageModelChatOptions['service_tier']>,
    'auto' | 'default' | 'flex' | 'priority'
  >
>;
type ExpectedReasoningEffort = Expect<
  Equal<
    NonNullable<CerebrasLanguageModelChatOptions['reasoningEffort']>,
    'none' | 'low' | 'medium' | 'high'
  >
>;
type ExpectedReasoningFormat = Expect<
  Equal<
    NonNullable<CerebrasLanguageModelChatOptions['reasoning_format']>,
    'none' | 'parsed' | 'text_parsed' | 'raw' | 'hidden'
  >
>;

const options = {
  user: 'user-123',
  textVerbosity: 'medium',
  strictJsonSchema: true,
  max_completion_tokens: 64,
  parallel_tool_calls: false,
  logprobs: true,
  top_logprobs: 2,
  logit_bias: { '42': 1 },
  service_tier: 'priority',
  reasoningEffort: 'none',
  reasoning_format: 'parsed',
  prediction: { type: 'content', content: 'expected' },
  prompt_cache_key: 'conversation-123',
} satisfies CerebrasLanguageModelChatOptions;

void options;
`;

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

  if (diagnostic.file == null || diagnostic.start == null) {
    return `TS${diagnostic.code}: ${message}`;
  }

  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start,
  );

  return `TS${diagnostic.code} (${line + 1},${character + 1}): ${message}`;
}

function isIssueDiagnostic(diagnostic: ts.Diagnostic): boolean {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

  return (
    (diagnostic.code === 2305 &&
      message.includes('CerebrasLanguageModelChatOptions')) ||
    diagnostic.code === 2322 ||
    diagnostic.code === 2344 ||
    diagnostic.code === 2353 ||
    diagnostic.code === 1360
  );
}

async function main() {
  const probeFileName = path.resolve(
    process.cwd(),
    'src/reproduction/issue-19216-type-probe.ts',
  );
  const compilerOptions: ts.CompilerOptions = {
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(compilerOptions);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultReadFile = host.readFile.bind(host);

  host.fileExists = fileName =>
    fileName === probeFileName || defaultFileExists(fileName);
  host.readFile = fileName =>
    fileName === probeFileName ? probeSource : defaultReadFile(fileName);
  host.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    fileName === probeFileName
      ? ts.createSourceFile(
          fileName,
          probeSource,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      : defaultGetSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );

  const program = ts.createProgram([probeFileName], compilerOptions, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file?.fileName === probeFileName);

  if (diagnostics.length === 0) {
    console.log(
      'Cerebras provider options are publicly exported and type-check with the documented fields and constraints.',
    );
    return;
  }

  console.error(diagnostics.map(formatDiagnostic).join('\n'));

  if (!diagnostics.every(isIssueDiagnostic)) {
    throw new Error(
      'The TypeScript probe failed for an unexpected reason; reproduction is inconclusive.',
    );
  }

  throw new Error(issueSignal);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
