import { createModelslab } from '@ai-sdk/modelslab';
import { experimental_generateImage as generateImage } from 'ai';

async function simpleTest() {
  const testProvider = createModelslab({
    apiKey: 'J3hO2o8HivAqNkAxjZEmVCUNJYtuqQAUCiT2yUjuJ7orGrqUq15dashJymbz',
  });

  try {
    const result = await generateImage({
      model: testProvider.image('realtime-text2img'),
      prompt: 'A superman flying in car in sky',
    });

    console.log('REQUEST:');
    console.log({
      model: 'realtime-text2img',
      prompt: 'A red apple',
    });

    console.log('\nRESPONSE:');
    console.log(result);
  } catch (error) {
    console.log('ERROR:');
    console.log(error);
  }
}

simpleTest();
