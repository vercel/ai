import 'dotenv/config';

async function main() {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            required: ['elements'],
            type: 'object',
            properties: {
              elements: {
                type: 'array',
                items: {
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        age: { type: 'number' },
                      },
                      required: ['age'],
                    },
                    {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                      },
                      required: ['name'],
                    },
                  ],
                },
              },
            },
          },
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Generate a JSON object',
              },
            ],
          },
        ],
      }),
    },
  );

  console.log(await response.json());
}

main().catch(error => {
  console.error(JSON.stringify(error, null, 2));
});
