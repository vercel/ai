import { createFiremoon } from '@ai-sdk/firemoon';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
    const provider = createFiremoon({
        apiKey: process.env.FIREMOON_API_KEY,
    });

    const prompt = 'A beautiful sunset over mountains with vibrant colors';
    const result = await generateImage({
        model: provider.image('flux/dev'),
        prompt,
        size: '1024x1024',
    });

    await presentImages(result.images);

    console.log(
        'Provider metadata:',
        JSON.stringify(result.providerMetadata, null, 2),
    );
}

main().catch(console.error);
