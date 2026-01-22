import * as fs from 'fs';
import * as path from 'path';
import * as z4 from 'zod/v4';

const MODALITIES = ['language', 'embedding', 'image'] as const;
const API_URL = 'https://ai-gateway.vercel.sh/v1/models';
const OUTPUT_DIR = path.join(__dirname, '..', 'src');

const modelSchema = z4.object({
  id: z4.string(),
  type: z4.enum(MODALITIES),
});

const modelsResponseSchema = z4.object({
  data: z4.array(modelSchema),
});

type ModelsResponse = z4.infer<typeof modelsResponseSchema>;
type Modality = (typeof MODALITIES)[number];

const MODALITY_CONFIG: Record<
  Modality,
  { outputFile: string; typeName: string }
> = {
  language: {
    outputFile: 'gateway-language-model-settings.ts',
    typeName: 'GatewayModelId',
  },
  embedding: {
    outputFile: 'gateway-embedding-model-settings.ts',
    typeName: 'GatewayEmbeddingModelId',
  },
  image: {
    outputFile: 'gateway-image-model-settings.ts',
    typeName: 'GatewayImageModelId',
  },
};

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

function generateTypeFile(modelIds: string[], typeName: string): string {
  const sortedIds = [...modelIds].sort();

  if (sortedIds.length === 0) {
    return `export type ${typeName} = string & {};\n`;
  }

  const lines = [
    `export type ${typeName} =`,
    ...sortedIds.map(id => `  | '${id}'`),
    '  | (string & {});',
  ];

  return lines.join('\n') + '\n';
}

async function main() {
  const response = await fetchModels();

  const modelsByModality = Object.fromEntries(
    MODALITIES.map(modality => [modality, [] as string[]]),
  ) as Record<Modality, string[]>;

  for (const model of response.data) {
    modelsByModality[model.type].push(model.id);
  }

  for (const modality of MODALITIES) {
    const config = MODALITY_CONFIG[modality];
    const modelIds = modelsByModality[modality];

    if (modelIds.length === 0) {
      throw new Error(`No ${modality} models found`);
    }

    const content = generateTypeFile(modelIds, config.typeName);
    const outputPath = path.join(OUTPUT_DIR, config.outputFile);

    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(
      `Generated ${config.outputFile} with ${modelIds.length} models`,
    );
  }

  console.log('Model settings updated successfully');
}

main();
