import { readFileSync } from 'node:fs';
import { createGateway, generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';
import 'dotenv/config';

run(async () => {
    const imageBuffer = readFileSync('data/comic-cat.png');

    console.log('INPUT IMAGE:');
    await presentImages([
        {
            uint8Array: new Uint8Array(imageBuffer),
            base64: '',
            mediaType: 'image/png',
        },
    ]);

    const prompt =
        'Turn the cat into a dog but retain the style and dimensions of the original image';
    console.log(`PROMPT: ${prompt}`);

    const gateway = createGateway({
        baseURL: 'http://localhost:3000/v3/ai',
    })

    const { images } = await generateImage({
        model: gateway.imageModel('openai/gpt-image-1'),
        prompt: {
            text: prompt,
            images: [imageBuffer],
        },
    });

    console.log('OUTPUT IMAGE:');
    await presentImages(images);
});
