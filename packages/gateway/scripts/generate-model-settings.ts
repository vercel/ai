import * as fs from 'fs';
import * as path from 'path';

interface Model {
  id: string;
  type: 'language' | 'embedding' | 'image';
}

interface ModelsResponse {
  data: Model[];
}

const API_URL = 'https://ai-gateway.vercel.sh/v1/models';
const OUTPUT_DIR = path.join(__dirname, '..', 'src');

const TYPE_CONFIG = {
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
} as const;

async function fetchModels(): Promise<ModelsResponse> {
  console.log('Fetching models from', API_URL);

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.data)) {
      throw new Error('Invalid API response structure');
    }

    return data as ModelsResponse;
  } catch (error) {
    console.error('Failed to fetch models:', error);
    throw error;
  }
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
  try {
    const response = await fetchModels();

    const modelsByType: Record<string, string[]> = {
      language: [],
      embedding: [],
      image: [],
    };

    // Group models by type
    for (const model of response.data) {
      if (model.type in modelsByType) {
        modelsByType[model.type].push(model.id);
      }
    }

    // Generate and write files for each type
    for (const [type, config] of Object.entries(TYPE_CONFIG)) {
      const modelIds = modelsByType[type];

      if (modelIds.length === 0) {
        console.error(`Error: No ${type} models found in API response`);
        process.exit(1);
      }

      const content = generateTypeFile(modelIds, config.typeName);
      const outputPath = path.join(OUTPUT_DIR, config.outputFile);

      fs.writeFileSync(outputPath, content, 'utf-8');
      console.log(
        `Generated ${config.outputFile} with ${modelIds.length} models`,
      );
    }

    console.log('Model settings updated successfully');
  } catch (error) {
    console.error('Failed to generate model settings:', error);
    process.exit(1);
  }
}

main();
