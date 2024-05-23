import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';

it('should convert uint8 image parts', async () => {
  const result = convertToGoogleVertexContentRequest([
    {
      role: 'user',
      content: [
        {
          type: 'image',
          image: new Uint8Array([0, 1, 2, 3]),
          mimeType: 'image/png',
        },
      ],
    },
  ]);

  expect(result).toEqual({
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'AAECAw==',
            },
          },
        ],
      },
    ],
  });
});
