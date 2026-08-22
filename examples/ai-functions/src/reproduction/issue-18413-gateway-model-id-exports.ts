import type {
  GatewayEmbeddingModelId,
  GatewayImageModelId,
  GatewayModelId,
  GatewayProvider,
  GatewayRerankingModelId,
  GatewaySpeechModelId,
  GatewayTranscriptionModelId,
  GatewayVideoModelId,
} from '@ai-sdk/gateway';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type ExistingPublicModelIds = [
  GatewayModelId,
  GatewayRerankingModelId,
  GatewaySpeechModelId,
  GatewayTranscriptionModelId,
  GatewayVideoModelId,
];

type ReconstructedEmbeddingModelId = Parameters<
  GatewayProvider['embeddingModel']
>[0];
type ReconstructedImageModelId = Parameters<GatewayProvider['imageModel']>[0];

type MissingPublicModelIds = [
  GatewayEmbeddingModelId,
  GatewayImageModelId,
  ReconstructedEmbeddingModelId,
  ReconstructedImageModelId,
  ExistingPublicModelIds,
];

async function main() {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      fileURLToPath(import.meta.url),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  const output = `${result.stdout}${result.stderr}`;
  const diagnostics = output
    .split('\n')
    .filter(line => /\berror TS\d+:/.test(line));
  const embeddingDiagnostic = diagnostics.find(line =>
    line.includes("'GatewayEmbeddingModelId'"),
  );
  const imageDiagnostic = diagnostics.find(line =>
    line.includes("'GatewayImageModelId'"),
  );
  const unexpectedDiagnostics = diagnostics.filter(
    line =>
      !line.includes("'GatewayEmbeddingModelId'") &&
      !line.includes("'GatewayImageModelId'"),
  );

  console.log(
    JSON.stringify(
      {
        compilerExitCode: result.status,
        diagnostics,
        existingPublicModelIdsTypeChecked: unexpectedDiagnostics.length === 0,
        consumerWorkaroundTypeChecked: unexpectedDiagnostics.length === 0,
      },
      null,
      2,
    ),
  );

  if (result.status === 0) {
    return;
  }

  if (
    embeddingDiagnostic != null &&
    imageDiagnostic != null &&
    unexpectedDiagnostics.length === 0
  ) {
    throw new Error(
      'ISSUE 18413 REPRODUCED: @ai-sdk/gateway does not export GatewayEmbeddingModelId or GatewayImageModelId.',
    );
  }

  throw new Error(
    `Unexpected TypeScript reproduction result:\n${output || result.error}`,
  );
}

void (undefined as MissingPublicModelIds | undefined);

main().catch(error => {
  console.error(error);
  process.exit(1);
});
