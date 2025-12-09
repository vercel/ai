// @ts-check

import { readFileSync } from 'fs';
import { generateAuthToken } from '../../../../packages/google-vertex/src/google-vertex-auth-google-auth-library';
import { presentImages } from '../lib/present-image';

import 'dotenv/config';
import { experimental_generateImage as generateImage } from 'ai';
import { GoogleVertexImageProviderOptions, vertex } from '@ai-sdk/google-vertex';

/* 
    see
    https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/edit-insert-objects#rest
*/

type RawReferenceImage = {
  referenceType: 'REFERENCE_TYPE_RAW';
  referenceId: number;
  referenceImage: {
    /**
     * A base64-encoded image of the image being edited that is 10MB or less in size.
     * For more information about base64-encoding, see Base64 encode and decode files.
     */
    bytesBase64Encoded: string;
  };
};

type MaskReferenceImage = {
  referenceType: 'REFERENCE_TYPE_MASK';
  referenceId: number;
  referenceImage: {
    /**
     * A base64-encoded black and white mask image that is 10MB or less in size.
     */
    bytesBase64Encoded: string;
  };
  maskImageConfig: {
    /**
     * The mask mode to use.
     * - `MASK_MODE_DEFAULT` - Default value for mask mode.
     * - `MASK_MODE_USER_PROVIDED` - User provided mask. No segmentation needed.
     * - `MASK_MODE_DETECTION_BOX` - Mask from detected bounding boxes.
     * - `MASK_MODE_CLOTHING_AREA` - Masks from segmenting the clothing area with open-vocab segmentation.
     * - `MASK_MODE_PARSED_PERSON` - Masks from segmenting the person body and clothing using the person-parsing model.
     */
    maskMode:
      | 'MASK_MODE_DEFAULT'
      | 'MASK_MODE_USER_PROVIDED'
      | 'MASK_MODE_DETECTION_BOX'
      | 'MASK_MODE_CLOTHING_AREA'
      | 'MASK_MODE_PARSED_PERSON';
    /**
     * Optional. A float value between 0 and 1, inclusive, that represents the
     * percentage of the image width to grow the mask by. Using dilation helps
     * compensate for imprecise masks. We recommend a value of 0.01.
     */
    dilation?: number;
  };
};

type Input = {
  instances: Array<{
    /**
     * Optional. A text prompt to guide the images that the model generates.
     * For best results, use a description of the masked area and avoid single-word
     * prompts. For example, use "a cute corgi" instead of "corgi".
     */
    prompt: string;
    referenceImages: Array<RawReferenceImage | MaskReferenceImage>;
  }>;
  parameters: {
    editConfig: {
      /**
       * Optional. An integer that represents the number of sampling steps.
       * A higher value offers better image quality, a lower value offers better latency.
       *
       * We recommend that you try 35 steps to start. If the quality doesn't meet
       * your requirements, then we recommend increasing the value towards an
       * upper limit of 75.
       */
      baseSteps: number;
    };
    editMode: 'EDIT_MODE_INPAINT_INSERTION';
    /**
     * Optional. An integer that describes the number of images to generate.
     * The accepted range of values is 1-4. The default value is 4.
     */
    sampleCount: number;
  };
};

type Output = {
  predictions: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
};

// const MODEL_ID = 'imagen-4.0-generate-001';
const MODEL_ID = 'imagen-3.0-capability-001'; // `imagen-4.0-generate-001` does not support edits
const REGION = process.env.GOOGLE_VERTEX_LOCATION;
const PROJECT_ID = process.env.GOOGLE_VERTEX_PROJECT;
const API_URL = `https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/publishers/google/models/${MODEL_ID}:predict`;

async function insertWithMask() {
  const image = readFileSync('data/sunlit_lounge.png');
  const mask = readFileSync('data/sunlit_lounge_mask_black_white.png');
  const B64_BASE_IMAGE = image.toString('base64');
  const B64_MASK_IMAGE = mask.toString('base64');

  const TEXT_PROMPT =
    'A sunlit indoor lounge area with a pool containing a flamingo';
  const EDIT_STEPS = 50;
  const SAMPLE_COUNT = 1;
  const MASK_DILATION = 0.01;

  const input: Input = {
    instances: [
      {
        prompt: TEXT_PROMPT,
        referenceImages: [
          {
            referenceType: 'REFERENCE_TYPE_RAW',
            referenceId: 1,
            referenceImage: {
              bytesBase64Encoded: B64_BASE_IMAGE,
            },
          },
          {
            referenceType: 'REFERENCE_TYPE_MASK',
            referenceId: 2,
            referenceImage: {
              bytesBase64Encoded: B64_MASK_IMAGE,
            },
            maskImageConfig: {
              maskMode: 'MASK_MODE_USER_PROVIDED',
              dilation: MASK_DILATION,
            },
          },
        ],
      },
    ],
    parameters: {
      editConfig: {
        baseSteps: EDIT_STEPS,
      },
      editMode: 'EDIT_MODE_INPAINT_INSERTION',
      sampleCount: SAMPLE_COUNT,
    },
  };

  console.log('API_URL', API_URL);
  const response = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: {
      Authorization: `Bearer ${await generateAuthToken()}`,
      'Content-Type': 'application/json',
    },
  });
  const textResponse = await response.clone().text();

  try {
    const data: Output = await response.json();
    console.log(data);

    const images = data.predictions.map(prediction => {
      return {
        base64: '',
        mediaType: '',
        uint8Array: Uint8Array.from(
          Buffer.from(prediction.bytesBase64Encoded, 'base64'),
        ),
      };
    });

    await presentImages(images);
  } catch (error) {
    console.error('Error response:', textResponse);
  }
}

async function insertWithMaskAi() {
  const image = readFileSync('data/sunlit_lounge.png');
  const mask = readFileSync('data/sunlit_lounge_mask_black_white.png');

  const { images } = await generateImage({
    model: vertex.image(MODEL_ID),
    prompt: {
      text: 'A sunlit indoor lounge area with a pool containing a flamingo',
      images: [image],
      mask: mask,
    },
    providerOptions: {
      vertex: {
        edit: {
          baseSteps: 50,
          mode: 'EDIT_MODE_INPAINT_INSERTION',
          maskMode: 'MASK_MODE_USER_PROVIDED',
          maskDilation: 0.01,
        },
      } satisfies GoogleVertexImageProviderOptions,
    },
  });
  await presentImages(images);
}

// insertWithMask().catch(console.error);
insertWithMaskAi().catch(error => console.dir(error, { depth: null }));
