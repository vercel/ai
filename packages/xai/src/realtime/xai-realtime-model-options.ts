import type { XaiModelIds } from '../xai-model-catalog';

export type XaiRealtimeModelId = XaiModelIds['realtime'] | (string & {});

export type XaiRealtimeModelOptions = Record<string, never>;
