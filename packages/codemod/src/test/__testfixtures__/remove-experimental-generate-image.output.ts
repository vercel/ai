import { generateImage, type GenerateImageResult } from 'ai';

declare const imageModel: any;

const result: GenerateImageResult = await generateImage({
  model: imageModel,
  prompt: 'A red panda eating bamboo',
});
