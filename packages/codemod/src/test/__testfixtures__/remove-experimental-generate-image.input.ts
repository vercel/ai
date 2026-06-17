import {
  experimental_generateImage,
  type Experimental_GenerateImageResult,
} from 'ai';

declare const imageModel: any;

const result: Experimental_GenerateImageResult =
  await experimental_generateImage({
    model: imageModel,
    prompt: 'A red panda eating bamboo',
  });
