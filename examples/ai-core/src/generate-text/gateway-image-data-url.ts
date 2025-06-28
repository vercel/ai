import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  // Read the image file and create a proper data URL
  const imageData = fs.readFileSync('./data/comic-cat.png');
  const base64Data = imageData.toString('base64');
  const dataUrl = `data:image/png;base64,${base64Data}`;

  const result = await generateText({
    model: 'xai/grok-2-vision',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'image',
            image: dataUrl,
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
