import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const reproductionSource = `
import { WorkflowAgent } from '@ai-sdk/workflow';
import { tool, type LanguageModel } from 'ai';
import { z } from 'zod';

declare const model: LanguageModel;

const tools = {
  weather: tool({
    inputSchema: z.object({ city: z.string() }),
    outputSchema: z.object({ temperature: z.number() }),
    contextSchema: z.object({ units: z.enum(['c', 'f']) }),
    execute: async ({ city }, { context }) => {
      city.toUpperCase();
      context.units;
      return { temperature: 20 };
    },
  }),
  stocks: tool({
    inputSchema: z.object({ symbol: z.string() }),
    outputSchema: z.object({ price: z.number() }),
    contextSchema: z.object({ exchange: z.enum(['nasdaq', 'nyse']) }),
    execute: async ({ symbol }, { context }) => {
      symbol.toUpperCase();
      context.exchange;
      return { price: 100 };
    },
  }),
};

new WorkflowAgent({
  model,
  tools,
  toolsContext: {
    weather: { units: 'c' },
    stocks: { exchange: 'nasdaq' },
  },
  onToolExecutionStart(event) {
    if (event.toolCall.toolName === 'weather') {
      const city: string = event.toolCall.input.city; // ISSUE_20078_START_INPUT
      const units: 'c' | 'f' = event.toolContext.units; // ISSUE_20078_START_CONTEXT
      void city;
      void units;
    }
  },
  onToolExecutionEnd(event) {
    if (event.toolCall.toolName === 'weather' && event.success) {
      const city: string = event.toolCall.input.city; // ISSUE_20078_END_INPUT
      const units: 'c' | 'f' = event.toolContext.units; // ISSUE_20078_END_CONTEXT
      const temperature: number = event.output.temperature; // ISSUE_20078_END_OUTPUT
      void city;
      void units;
      void temperature;
    }
  },
});
`;

const assertionMarkers = [
  'ISSUE_20078_START_INPUT',
  'ISSUE_20078_START_CONTEXT',
  'ISSUE_20078_END_INPUT',
  'ISSUE_20078_END_CONTEXT',
  'ISSUE_20078_END_OUTPUT',
] as const;

async function main() {
  const virtualFile = path.resolve(
    'src/reproduction/issue-20078-callback-consumer.ts',
  );
  const options: ts.CompilerOptions = {
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: ['node'],
  };
  const host = ts.createCompilerHost(options);
  const originalFileExists = host.fileExists;
  const originalGetSourceFile = host.getSourceFile;
  const originalReadFile = host.readFile;

  host.fileExists = fileName =>
    path.resolve(fileName) === virtualFile || originalFileExists(fileName);
  host.readFile = fileName =>
    path.resolve(fileName) === virtualFile
      ? reproductionSource
      : originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    path.resolve(fileName) === virtualFile
      ? ts.createSourceFile(fileName, reproductionSource, languageVersion, true)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreate);

  const program = ts.createProgram([virtualFile], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const sourceFile = program.getSourceFile(virtualFile);

  if (sourceFile == null) {
    throw new Error('Reproduction compiler did not load the virtual source.');
  }

  const markerFailures = assertionMarkers.filter(marker => {
    const markerPosition = reproductionSource.indexOf(marker);
    const markerLine =
      sourceFile.getLineAndCharacterOfPosition(markerPosition).line;

    return diagnostics.some(diagnostic => {
      if (diagnostic.file !== sourceFile || diagnostic.start == null) {
        return false;
      }

      return (
        sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line ===
        markerLine
      );
    });
  });

  const unrelatedDiagnostics = diagnostics.filter(diagnostic => {
    if (diagnostic.file !== sourceFile || diagnostic.start == null) {
      return true;
    }

    const line = sourceFile.getLineAndCharacterOfPosition(
      diagnostic.start,
    ).line;
    return !assertionMarkers.some(marker => {
      const markerPosition = reproductionSource.indexOf(marker);
      return (
        sourceFile.getLineAndCharacterOfPosition(markerPosition).line === line
      );
    });
  });

  if (unrelatedDiagnostics.length > 0) {
    throw new Error(
      `Reproduction setup failed:\n${ts.formatDiagnosticsWithColorAndContext(
        unrelatedDiagnostics,
        host,
      )}`,
    );
  }

  if (markerFailures.length > 0) {
    console.error(
      'ISSUE #20078 REPRODUCED: WorkflowAgent callbacks lose per-tool type correlation.',
    );
    console.error(`Failed assertions: ${markerFailures.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    'WorkflowAgent callback input, context, and output types remain correlated.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
