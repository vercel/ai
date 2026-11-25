import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as z4 from 'zod/v4';
import { gatewayModelIds } from '../src/gateway-model-catalog';

const API_URL = 'https://ai-gateway.vercel.sh/v1/models';
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'gateway-model-catalog.ts',
);

const modelSchema = z4.object({
  id: z4.string(),
  type: z4.string(),
});

const modelsResponseSchema = z4.object({
  data: z4.array(modelSchema),
});

type ModelsResponse = z4.infer<typeof modelsResponseSchema>;

async function fetchModels(): Promise<ModelsResponse> {
  console.log('Fetching models from', API_URL);

  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: HTTP ${response.status} from ${API_URL}`,
    );
  }

  const data = await response.json();

  return modelsResponseSchema.parse(data);
}

function generateCatalogFile(
  modelsByType: Record<string, readonly string[]>,
): string {
  const lines = [
    'export const gatewayModelIds = {',
    ...Object.entries(modelsByType).flatMap(([type, modelIds]) => [
      `  ${type}: [`,
      ...[...modelIds].sort().map(id => `    ${JSON.stringify(id)},`),
      '  ],',
    ]),
    '} as const;',
    '',
    '/** Known model IDs, derived from the catalog declarations. */',
    'export type GatewayModelIds = {',
    '  [Type in keyof typeof gatewayModelIds]: (typeof gatewayModelIds)[Type][number];',
    '};',
    '',
  ];

  return lines.join('\n');
}

async function main() {
  const response = await fetchModels();
  const modelsByType: Record<string, string[]> = {};

  for (const model of response.data) {
    // Gateway's catalog migrates evaluation models to decision one at a time.
    // so treat evaluation as decision for now.
    const type = model.type === 'evaluation' ? 'decision' : model.type;
    if (!Object.hasOwn(gatewayModelIds, type)) {
      throw new Error(`Unsupported model type '${type}'.`);
    }
    if (!modelsByType[type]) {
      modelsByType[type] = [];
    }
    modelsByType[type].push(model.id);
  }

  if (Object.keys(modelsByType).length > 0) {
    // Preserve suggestions for modalities omitted from the upstream response.
    const content = generateCatalogFile({
      ...gatewayModelIds,
      ...modelsByType,
    });
    fs.writeFileSync(OUTPUT_PATH, content, 'utf-8');
    execFileSync('oxfmt', [OUTPUT_PATH], { stdio: 'inherit' });
  }

  console.log('Model settings updated successfully');
}

main();
