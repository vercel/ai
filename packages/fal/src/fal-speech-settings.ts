import type { FalModelIds } from './fal-model-catalog';

// https://fal.ai/explore/search?categories=text-to-speech&q=newest
export type FalSpeechModelId = FalModelIds['speech'] | (string & {});
