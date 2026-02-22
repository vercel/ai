import * as fs from 'fs';
import * as path from 'path';
import * as z from 'zod';

const API_URL = 'https://ai-gateway.vercel.sh/v1/models';
const OUTPUT_DIR = path.join(__dirname, '..', 'src');

const modelSchema = z.object({
  id: z.string(),
  type: z.string(),
});

const modelsResponseSchema = z.object({
  data: z.array(modelSchema),
});

type ModelsResponse = z.infer<typeof modelsResponseSchema>;

const MODALITY_CONFIG: Record<
  string,
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

function getModalityConfig(type: string): {
  outputFile: string;
  typeName: string;
} {
  if (MODALITY_CONFIG[type]) {
    return MODALITY_CONFIG[type];
  }
  const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
  return {
    outputFile: `gateway-${type}-model-settings.ts`,
    typeName: `Gateway${capitalized}ModelId`,
  };
}

async function main() {
  const response = await fetchModels();

  const modelsByType: Record<string, string[]> = {};

  for (const model of response.data) {
    if (model.type === 'video') continue;
    if (!modelsByType[model.type]) {
      modelsByType[model.type] = [];
    }
    modelsByType[model.type].push(model.id);
  }

  for (const [type, modelIds] of Object.entries(modelsByType)) {
    const config = getModalityConfig(type);
    const outputPath = path.join(OUTPUT_DIR, config.outputFile);

    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `Output file does not exist for type '${type}': ${config.outputFile}`,
      );
    }

    const content = generateTypeFile(modelIds, config.typeName);
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(
      `Generated ${config.outputFile} with ${modelIds.length} models`,
    );
  }

  console.log('Model settings updated successfully');
}

main();
