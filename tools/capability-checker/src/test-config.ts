import fs from 'fs';
import path from 'path';
import { ModelType, capabilitiesSchema } from './schema-capabilities';
import type { ModelConfig } from './types/model';

const CAPABILITIES_JSON_PATH = path.join(
  __dirname,
  '../etc/model-capabilities.json',
);

export function loadCapabilities() {
  const fileContents = fs.readFileSync(CAPABILITIES_JSON_PATH, 'utf8');
  const parsed = JSON.parse(fileContents);
  return capabilitiesSchema.parse(parsed);
}

export function groupModelsByProvider(models: ModelConfig[]) {
  return models.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = {
        language: [],
        embedding: [],
        image: [],
      };
    }
    acc[model.provider][model.modelType].push(model as ModelConfig);
    return acc;
  }, {} as Record<string, Record<ModelType, ModelConfig[]>>);
}
