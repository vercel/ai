import path from 'node:path';
import * as TypeScript from 'typescript';

type GeneratedFile =
  | { type: 'chunk'; fileName: string; code: string }
  | { type: 'asset'; fileName: string };

type GeneratedBundle = Record<string, GeneratedFile>;
type GeneratedOutputOptions = { dir?: string };

const declarationFilePattern = /\.d\.(?:ts|cts|mts)$/;

export function removeUnusedDeclarationImports() {
  const packageDirectory = process.cwd();
  const ts = TypeScript;

  if (Number.parseInt(ts.version, 10) !== 6) {
    throw new Error(`Expected TypeScript 6, found ${ts.version}`);
  }

  return {
    name: 'ai-sdk-remove-unused-declaration-imports',
    generateBundle(
      outputOptions: GeneratedOutputOptions,
      bundle: GeneratedBundle,
    ) {
      const outputDirectory = path.resolve(
        packageDirectory,
        outputOptions.dir ?? '.',
      );
      const declarationOutputs = Object.values(bundle).filter(
        output =>
          output.type === 'chunk' &&
          declarationFilePattern.test(output.fileName),
      );
      const virtualFiles = new Map(
        declarationOutputs.map(output => [
          path.resolve(outputDirectory, output.fileName),
          output.type === 'chunk' ? output.code : '',
        ]),
      );

      for (const output of declarationOutputs) {
        if (output.type !== 'chunk') {
          continue;
        }

        const fileName = path.resolve(outputDirectory, output.fileName);
        output.code = removeUnusedImports({
          ts,
          packageDirectory,
          fileName,
          source: output.code,
          virtualFiles,
        });
        virtualFiles.set(fileName, output.code);
      }
    },
  };
}

function removeUnusedImports({
  ts,
  packageDirectory,
  fileName,
  source,
  virtualFiles,
}: {
  ts: typeof TypeScript;
  packageDirectory: string;
  fileName: string;
  source: string;
  virtualFiles: Map<string, string>;
}) {
  const newLine = source.includes('\r\n') ? '\r\n' : '\n';
  const host: TypeScript.LanguageServiceHost = {
    getCompilationSettings: () => ({
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      noUnusedLocals: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    }),
    getCurrentDirectory: () => packageDirectory,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    getDirectories: ts.sys.getDirectories,
    getNewLine: () => newLine,
    getScriptFileNames: () => [fileName],
    getScriptSnapshot: requestedFileName => {
      const text =
        virtualFiles.get(path.resolve(requestedFileName)) ??
        ts.sys.readFile(requestedFileName);
      return text == null ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getScriptVersion: () => '0',
    readDirectory: ts.sys.readDirectory,
    readFile: requestedFileName =>
      virtualFiles.get(path.resolve(requestedFileName)) ??
      ts.sys.readFile(requestedFileName),
    directoryExists: ts.sys.directoryExists,
    fileExists: requestedFileName =>
      virtualFiles.has(path.resolve(requestedFileName)) ||
      ts.sys.fileExists(requestedFileName),
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };

  const service = ts.createLanguageService(host);
  let changes: readonly TypeScript.FileTextChanges[];

  try {
    changes = service.organizeImports(
      {
        type: 'file',
        fileName,
        mode: ts.OrganizeImportsMode.RemoveUnused,
      },
      ts.getDefaultFormatCodeSettings(newLine),
      { quotePreference: getQuotePreference(ts, fileName, source) },
    );
  } finally {
    service.dispose();
  }

  const edits = changes.flatMap(change => {
    if (path.resolve(change.fileName) !== fileName) {
      throw new Error(`Unexpected TypeScript edit for ${change.fileName}`);
    }

    return [...change.textChanges];
  });
  edits.sort(
    (left, right) =>
      right.span.start - left.span.start ||
      right.span.length - left.span.length ||
      compare(left.newText, right.newText),
  );

  let code = source;
  let nextEditStart = source.length;

  for (const edit of edits) {
    const { start, length } = edit.span;
    const end = start + length;

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(length) ||
      start < 0 ||
      length < 0 ||
      end > source.length ||
      end > nextEditStart
    ) {
      throw new Error(`Invalid or overlapping TypeScript edit at ${start}`);
    }

    code = code.slice(0, start) + edit.newText + code.slice(end);
    nextEditStart = start;
  }

  if (!sameArray(scanComments(ts, source), scanComments(ts, code))) {
    throw new Error('TypeScript import cleanup changed declaration comments');
  }

  if (
    !sameArray(
      scanNonImportStatements(ts, fileName, source),
      scanNonImportStatements(ts, fileName, code),
    )
  ) {
    throw new Error('TypeScript import cleanup changed declaration code');
  }

  return code;
}

function getQuotePreference(
  ts: typeof TypeScript,
  fileName: string,
  source: string,
): 'single' | 'double' | 'auto' {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return source[statement.moduleSpecifier.getStart(sourceFile)] === "'"
        ? 'single'
        : 'double';
    }
  }

  return 'auto';
}

function scanComments(ts: typeof TypeScript, source: string) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source,
  );
  const comments: string[] = [];

  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      comments.push(scanner.getTokenText());
    }
  }

  return comments;
}

function scanNonImportStatements(
  ts: typeof TypeScript,
  fileName: string,
  source: string,
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );

  return sourceFile.statements
    .filter(statement => !ts.isImportDeclaration(statement))
    .map(statement => statement.getText(sourceFile));
}

function sameArray(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
