import 'dotenv/config';
import { venice as provider } from '@ai-sdk/venice';

async function main() {
  const response = await fetch(provider.baseURL + '/image/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VENICE_API_KEY}`
    },
    body: JSON.stringify({
      model: 'fluently-xl',
      prompt: 'A serene mountain landscape at sunset',
      safe_mode: true,
    })
  });

  const result = await response.json();
  console.log('Generated image:', result);
}

main().catch(console.error); 