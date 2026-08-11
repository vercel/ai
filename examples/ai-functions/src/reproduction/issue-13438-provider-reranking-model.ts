import path from 'node:path';
import ts from 'typescript';

const reproductionSource = `
import { createOpenResponses } from '@ai-sdk/open-responses';
import type { ProviderV3 } from '@ai-sdk/provider';
import type { Provider } from 'ai';

const openResponsesProvider: Provider = createOpenResponses({
  name: 'test',
  url: 'http://localhost/v1/responses',
});

declare const providerV3: ProviderV3;
const genericProvider: Provider = providerV3;

void openResponsesProvider;
void genericProvider;
`;

async function main() {
  const virtualFileName = path.resolve(
    'src/reproduction/issue-13438-provider-reranking-model-input.ts',
  );
  const configFileName = ts.findConfigFile(
    process.cwd(),
    ts.sys.fileExists,
    'tsconfig.json',
  );

  if (configFileName == null) {
    throw new Error('Could not find the ai-functions tsconfig.json.');
  }

  const configFile = ts.readConfigFile(configFileName, ts.sys.readFile);

  if (configFile.error != null) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'),
    );
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configFileName),
    {
      composite: false,
      declaration: false,
      noEmit: true,
    },
    configFileName,
  );
  const host = ts.createCompilerHost(parsedConfig.options);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultReadFile = host.readFile.bind(host);

  host.fileExists = fileName =>
    path.resolve(fileName) === virtualFileName || defaultFileExists(fileName);
  host.readFile = fileName =>
    path.resolve(fileName) === virtualFileName
      ? reproductionSource
      : defaultReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    path.resolve(fileName) === virtualFileName
      ? ts.createSourceFile(
          virtualFileName,
          reproductionSource,
          languageVersion,
          true,
        )
      : defaultGetSourceFile(fileName, languageVersion, onError, shouldCreate);

  const program = ts.createProgram(
    [virtualFileName],
    parsedConfig.options,
    host,
  );
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file?.fileName === virtualFileName);
  const messages = diagnostics.map(diagnostic => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
  const rerankingAssignmentErrors = messages.filter(
    diagnostic =>
      diagnostic.code === 2322 &&
      diagnostic.message.includes('rerankingModel') &&
      diagnostic.message.includes('undefined') &&
      (diagnostic.message.includes('OpenResponsesProvider') ||
        diagnostic.message.includes('ProviderV3')),
  );

  if (rerankingAssignmentErrors.length === 2 && messages.length === 2) {
    console.error(JSON.stringify(messages, null, 2));
    throw new Error(
      'ISSUE_13438_REPRODUCED: Provider rejects providers whose rerankingModel is optional.',
    );
  }

  if (messages.length > 0) {
    throw new Error(
      `Unexpected TypeScript diagnostics:\n${JSON.stringify(messages, null, 2)}`,
    );
  }

  console.log(
    'Provider accepts both OpenResponsesProvider and ProviderV3 with an optional rerankingModel.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
