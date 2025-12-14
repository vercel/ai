import 'dotenv/config';

/* 
    NOTE: Google Generative AI does NOT support image editing.
    
    This file demonstrates that the API returns an error when attempting image editing
    with Google Generative AI. For image editing capabilities, use Google Vertex AI 
    (@ai-sdk/google-vertex) instead.
    
    See: examples/ai-core/src/edit-image/google-vertex.ts for a working example.
*/

const MODEL_ID = 'imagen-3.0-capability-001';
const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:predict`;

async function testImageEditingNotSupported() {
  // Attempt to call the image editing API - this will fail
  const input = {
    instances: [
      {
        prompt: 'A sunlit indoor lounge area with a pool containing a flamingo',
        referenceImages: [
          {
            referenceType: 'REFERENCE_TYPE_RAW',
            referenceId: 1,
            referenceImage: {
              bytesBase64Encoded: 'base64-encoded-image-data',
            },
          },
        ],
      },
    ],
    parameters: {
      editConfig: {
        baseSteps: 50,
      },
      editMode: 'EDIT_MODE_INPAINT_INSERTION',
      sampleCount: 1,
    },
  };

  console.log('API_URL:', API_URL);
  console.log(
    '\nAttempting image editing with Google Generative AI (this will fail)...\n',
  );

  const response = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: {
      'x-goog-api-key': API_KEY!,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  console.log('Response status:', response.status);
  console.log('Response:', JSON.stringify(data, null, 2));

  if (!response.ok) {
    console.log(
      '\n✓ As expected, Google Generative AI does not support image editing.',
    );
    console.log(
      '  Use Google Vertex AI (@ai-sdk/google-vertex) for image editing.',
    );
  }
}

testImageEditingNotSupported().catch(console.error);
