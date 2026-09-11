import { InvalidArgumentError } from 'ai';
import { DefaultGeneratedAudioFile } from 'ai/internal';

try {
  new DefaultGeneratedAudioFile({
    data: new Uint8Array([1, 2, 3]),
    mediaType: 'audio/',
  });

  throw new Error('Expected audio file construction to fail.');
} catch (error) {
  if (!InvalidArgumentError.isInstance(error)) {
    throw error;
  }

  console.log(error.name);
  console.log('Parameter:', error.parameter);
  console.log('Value:', error.value);
}
