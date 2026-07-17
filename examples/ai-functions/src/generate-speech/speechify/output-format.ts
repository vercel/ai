import { speechify } from '@ai-sdk/speechify';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: speechify.speech('simba-3.2'),
    text: 'This audio is generated as 8kHz u-law for telephony.',
    outputFormat: 'ulaw_8000',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);
  console.log('Output format: u-law at 8kHz');

  await saveAudioFile(result.audio);
});
