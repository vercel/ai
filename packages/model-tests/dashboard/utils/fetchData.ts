import fs from 'fs/promises';
import path from 'path';

export interface ModelCapability {
  provider: string;
  modelType: string;
  modelId: string;
  timestamp: string;
  capabilities: {
    [key: string]: {
      supported: boolean;
    };
  };
  lastUpdated: string;
}

async function findDataDirectory(): Promise<string> {
  let currentDir = 'results';
  const maxDepth = 5; // Limit the search depth to avoid infinite loops

  for (let i = 0; i < maxDepth; i++) {
    const dataDir = path.join(currentDir, 'results');
    try {
      await fs.access(dataDir);
      return dataDir;
    } catch (error) {
      // Directory not found, move up one level
      currentDir = path.dirname(currentDir);
    }
  }

  throw new Error('Could not find the results directory');
}

export async function fetchModelCapabilities(): Promise<ModelCapability[]> {
  const dataDir = await findDataDirectory();
  const providers = await fs.readdir(dataDir);

  const allCapabilities: ModelCapability[] = [];

  for (const provider of providers) {
    const providerDir = path.join(dataDir, provider);
    const stats = await fs.stat(providerDir);
    if (!stats.isDirectory()) continue;

    const modelTypes = await fs.readdir(providerDir);

    for (const modelType of modelTypes) {
      const modelTypeDir = path.join(providerDir, modelType);
      const modelTypeStats = await fs.stat(modelTypeDir);
      if (!modelTypeStats.isDirectory()) continue;

      const files = await fs.readdir(modelTypeDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(modelTypeDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          try {
            const data = JSON.parse(content) as ModelCapability;
            allCapabilities.push(data);
          } catch (error) {
            console.error(`Error parsing JSON file ${filePath}:`, error);
          }
        }
      }
    }
  }

  return allCapabilities;
}
