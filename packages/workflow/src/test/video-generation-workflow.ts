import { experimental_generateVideo } from '../generate-video.js';
import { createSerializableVideoModel } from './serializable-video-model.js';

export async function videoGenerationWorkflow() {
  'use workflow';

  return experimental_generateVideo({
    model: createSerializableVideoModel(),
    prompt: 'A lighthouse in fog',
  });
}
