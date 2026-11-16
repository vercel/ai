import { GatewayBatch } from './gateway-batch';
import { GatewayDecisionModel } from './gateway-decision-model';
import type { GatewayDecisionModelId } from './gateway-decision-model-settings';
import { GatewayEmbeddingModel } from './gateway-embedding-model';
import type { GatewayEmbeddingModelId } from './gateway-embedding-model-settings';
import { GatewayImageModel } from './gateway-image-model';
import type { GatewayImageModelId } from './gateway-image-model-settings';
import { GatewayLanguageModel } from './gateway-language-model';
import type { GatewayModelId } from './gateway-language-model-settings';
import {
  createGatewayModelConfig,
  type GatewayModelConfig,
} from './gateway-model-config';
import { GatewayRerankingModel } from './gateway-reranking-model';
import type { GatewayRerankingModelId } from './gateway-reranking-model-settings';
import { GatewaySpeechModel } from './gateway-speech-model';
import type { GatewaySpeechModelId } from './gateway-speech-model-settings';
import { GatewayTranscriptionModel } from './gateway-transcription-model';
import type { GatewayTranscriptionModelId } from './gateway-transcription-model-settings';
import { GatewayVideoModel } from './gateway-video-model';
import type { GatewayVideoModelId } from './gateway-video-model-settings';

// Per-modality equivalents of the default `gateway` instance's model factories.
// The AI SDK uses them to resolve string model IDs, so that e.g. `generateText`
// bundles only the Gateway language model rather than the whole provider.

let defaultConfig: GatewayModelConfig | undefined;

function getDefaultModelSettings() {
  defaultConfig ??= createGatewayModelConfig({});
  return defaultConfig.createModelSettings();
}

export function createDefaultGatewayLanguageModel(modelId: GatewayModelId) {
  return new GatewayLanguageModel(modelId, getDefaultModelSettings());
}

export function createDefaultGatewayEmbeddingModel(
  modelId: GatewayEmbeddingModelId,
) {
  return new GatewayEmbeddingModel(modelId, getDefaultModelSettings());
}

export function createDefaultGatewayImageModel(modelId: GatewayImageModelId) {
  return new GatewayImageModel(modelId, getDefaultModelSettings());
}

export function createDefaultGatewayVideoModel(modelId: GatewayVideoModelId) {
  return new GatewayVideoModel(modelId, getDefaultModelSettings());
}

export function createDefaultGatewayRerankingModel(
  modelId: GatewayRerankingModelId,
) {
  return new GatewayRerankingModel(modelId, getDefaultModelSettings());
}

export function createDefaultGatewayDecisionModel(
  modelId: GatewayDecisionModelId,
) {
  return new GatewayDecisionModel(modelId, getDefaultModelSettings());
}

export function createDefaultGatewaySpeechModel(modelId: GatewaySpeechModelId) {
  return new GatewaySpeechModel(modelId, getDefaultModelSettings());
}

export function createDefaultGatewayTranscriptionModel(
  modelId: GatewayTranscriptionModelId,
) {
  return new GatewayTranscriptionModel(modelId, getDefaultModelSettings());
}

export function createDefaultGatewayBatch() {
  return new GatewayBatch(getDefaultModelSettings());
}
