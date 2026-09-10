import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createGateway } from '@ai-sdk/gateway';
import { generateImage } from 'ai';
import sharp from 'sharp';

const sourcePath = resolve('data/sunlit_lounge.png');
const maskPath = resolve('data/sunlit_lounge_mask.png');
const outputPath = resolve('src/reproduction/issue-14360-output.png');
const fixturePath = resolve(
  '../../packages/gateway/src/__fixtures__/issue-14360-gpt-image-1-inpainting-response.json',
);
const analysisFixturePath = resolve(
  '../../packages/gateway/src/__fixtures__/issue-14360-analysis.json',
);

type RecordedResponse = {
  request: {
    hasFiles: boolean;
    hasMask: boolean;
    modelId: string | null;
    specificationVersion: string | null;
  };
  response: {
    body: unknown;
    headers: Record<string, string>;
    status: number;
  };
};

async function main() {
  const source = await readFile(sourcePath);
  const mask = await readFile(maskPath);
  let recordedResponse: RecordedResponse | undefined;

  const gateway = createGateway({
    fetch: async (input, init) => {
      const requestBody =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {};
      const response = await fetch(input, init);
      const responseBody = await response.clone().json();
      const requestHeaders = new Headers(init?.headers);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      recordedResponse = {
        request: {
          hasFiles:
            Array.isArray(requestBody.files) && requestBody.files.length > 0,
          hasMask: requestBody.mask != null,
          modelId: requestHeaders.get('ai-model-id'),
          specificationVersion: requestHeaders.get(
            'ai-image-model-specification-version',
          ),
        },
        response: {
          body: responseBody,
          headers: responseHeaders,
          status: response.status,
        },
      };

      return response;
    },
  });

  const result = await generateImage({
    model: gateway.imageModel('openai/gpt-image-1'),
    prompt: {
      text: 'Replace the flamingo inside the pool with a bright yellow rubber duck. Preserve everything outside the transparent mask.',
      images: [source],
      mask,
    },
    size: '1024x1024',
    providerOptions: {
      openai: {
        quality: 'high',
      },
    },
  });

  await writeFile(outputPath, result.image.uint8Array);

  assert.ok(recordedResponse, 'Gateway response was not recorded');
  assert.equal(
    recordedResponse.request.hasFiles,
    true,
    'The Gateway client did not send the source image',
  );
  assert.equal(
    recordedResponse.request.hasMask,
    true,
    'The Gateway client did not send the mask',
  );

  const sourceImage = await sharp(source).removeAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const outputImage = await sharp(result.image.uint8Array)
    .resize(sourceImage.info.width, sourceImage.info.height, {
      fit: 'fill',
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const maskImage = await sharp(mask)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.equal(outputImage.info.width, sourceImage.info.width);
  assert.equal(outputImage.info.height, sourceImage.info.height);
  assert.equal(maskImage.info.width, sourceImage.info.width);
  assert.equal(maskImage.info.height, sourceImage.info.height);

  let editDifference = 0;
  let editPixels = 0;
  let preservedDifference = 0;
  let preservedPixels = 0;
  let substantiallyChangedPreservedPixels = 0;

  for (
    let pixelIndex = 0;
    pixelIndex < sourceImage.info.width * sourceImage.info.height;
    pixelIndex++
  ) {
    const sourceOffset = pixelIndex * sourceImage.info.channels;
    const outputOffset = pixelIndex * outputImage.info.channels;
    const maskAlpha = maskImage.data[pixelIndex * maskImage.info.channels + 3];
    const channelDifferences = [0, 1, 2].map(channel =>
      Math.abs(
        sourceImage.data[sourceOffset + channel] -
          outputImage.data[outputOffset + channel],
      ),
    );
    const pixelDifference =
      channelDifferences.reduce((sum, value) => sum + value, 0) / 3;

    if (maskAlpha <= 5) {
      editDifference += pixelDifference;
      editPixels++;
    } else if (maskAlpha >= 250) {
      preservedDifference += pixelDifference;
      preservedPixels++;
      if (Math.max(...channelDifferences) > 30) {
        substantiallyChangedPreservedPixels++;
      }
    }
  }

  const metrics = {
    editMeanAbsoluteDifference: editDifference / editPixels,
    preservedMeanAbsoluteDifference: preservedDifference / preservedPixels,
    substantiallyChangedPreservedRatio:
      substantiallyChangedPreservedPixels / preservedPixels,
  };

  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(
    fixturePath,
    `${JSON.stringify(recordedResponse, null, 2)}\n`,
  );
  await writeFile(
    analysisFixturePath,
    `${JSON.stringify(
      {
        input: {
          maskSha256: sha256(mask),
          sourceSha256: sha256(source),
        },
        metrics,
        output: {
          imageSha256: sha256(result.image.uint8Array),
        },
      },
      null,
      2,
    )}\n`,
  );

  console.log(JSON.stringify(metrics, null, 2));
  console.log(`Recorded Gateway response: ${fixturePath}`);
  console.log(`Recorded image analysis: ${analysisFixturePath}`);
  console.log(`Generated image: ${outputPath}`);

  assert.ok(
    metrics.preservedMeanAbsoluteDifference < 15 &&
      metrics.substantiallyChangedPreservedRatio < 0.25,
    `The Gateway ignored the mask: pixels marked for preservation changed across the image (${JSON.stringify(metrics)})`,
  );
  assert.ok(
    metrics.editMeanAbsoluteDifference >
      metrics.preservedMeanAbsoluteDifference * 1.5,
    `The generated changes were not concentrated in the transparent mask (${JSON.stringify(metrics)})`,
  );
}

function sha256(data: Uint8Array) {
  return createHash('sha256').update(data).digest('hex');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
