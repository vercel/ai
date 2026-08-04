import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type {
  GatewayEmbeddingModelId,
  GatewayImageModelId,
  GatewayModelId,
  GatewayRealtimeModelId,
  GatewayRerankingModelId,
  GatewaySpeechModelId,
  GatewayTranscriptionModelId,
  GatewayVideoModelId,
} from '@ai-sdk/gateway';

type GatewayModelIds =
  | GatewayEmbeddingModelId
  | GatewayImageModelId
  | GatewayModelId
  | GatewayRealtimeModelId
  | GatewayRerankingModelId
  | GatewaySpeechModelId
  | GatewayTranscriptionModelId
  | GatewayVideoModelId;

async function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '--noEmit',
      '--skipLibCheck',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      '--types',
      'node',
      scriptPath,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  const diagnostics = `${result.stdout}${result.stderr}`;
  const hasMissingExportDiagnostic = (name: string) =>
    diagnostics.includes(
      `declares '${name}' locally, but it is not exported`,
    ) ||
    diagnostics.includes(`no exported member '${name}'`) ||
    diagnostics.includes(`no exported member named '${name}'`);
  const missingEmbeddingExport = hasMissingExportDiagnostic(
    'GatewayEmbeddingModelId',
  );
  const missingImageExport = hasMissingExportDiagnostic('GatewayImageModelId');

  if (missingEmbeddingExport && missingImageExport) {
    console.error(diagnostics.trim());
    throw new Error(
      'Reproduced issue #18413: @ai-sdk/gateway does not export GatewayEmbeddingModelId or GatewayImageModelId.',
    );
  }

  if (result.status !== 0) {
    throw new Error(`Unexpected TypeScript diagnostics:\n${diagnostics}`);
  }

  const modelId: GatewayModelIds = 'provider/model';
  console.log(`All Gateway model ID types are publicly importable: ${modelId}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
