import type { FilesV4, ImageModelV4 } from '@ai-sdk/provider';
import { detectMediaType } from '@ai-sdk/provider-utils';
import { generateImage, uploadFile } from 'ai';

const samples = [
  {
    name: 'AVIF',
    mediaType: 'image/avif',
    // Complete 32x32 AVIF from the issue report.
    base64:
      'AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAACkAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgQAMAAAAABRpc3BlAAAAAAAAACAAAAAgAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAxbWRhdBIACgkYET/2iAhoNCAyGhlHh4Yhh5555oAAAIs8vWqDlPKk7vzpTvrg',
  },
  {
    name: 'HEIC',
    mediaType: 'image/heic',
    // Complete 32x32 HEIC from libheif's test corpus:
    // fuzzing/data/corpus/hevc32.heif
    base64:
      'AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAXttZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAABnwABAAAAAAAAAGwAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAA5waXRtAAAAAAABAAAA+2lwcnAAAADbaXBjbwAAAHZodmNDAQNwAAAAAAAAAAAAHvAA/P34+AAADwNgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQGEAAQAqQgEBA3AAAAMAkAAAAwAAAwAeoCCBBZbq5Ka5uAhoMCAAAAMDIAAAAwAhYgABAAZEAcFzwIkAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAoY2xhcAAAACAAAAABAAAAIAAAAAH////gAAAAAv///+AAAAACAAAADnBpeGkAAAAAAQgAAAAYaXBtYQAAAAAAAAABAAEFgQIDBYQAAAB0bWRhdAAAAGgoAa8TgPUrAhGDczL1mz4HCRRzxqbGjnnUrr1cLTO799zRz6nw0QjRMp+4I2Da10D3ghQEMvB53CWoI0S3qXIb99YsvLFaQ9ZLHxsJsZ9SxlvNJ5EgD4Y4miuaKu3bxPGXDHirp/9TzA==',
  },
] as const;

const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  console.log(`${label}: ${String(actual)}`);
  if (actual !== expected) {
    failures.push(
      `${label} expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

async function main() {
  for (const sample of samples) {
    const data = new Uint8Array(Buffer.from(sample.base64, 'base64'));
    const boxSize = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    ).getUint32(0);
    const boxAndBrand = new TextDecoder().decode(data.subarray(4, 12));

    check(`${sample.name} ftyp box size`, boxSize, 28);
    check(
      `${sample.name} box and brand`,
      boxAndBrand,
      `ftyp${sample.mediaType.slice(6)}`,
    );

    check(
      `${sample.name} generic byte detection`,
      detectMediaType({ data }),
      sample.mediaType,
    );
    check(
      `${sample.name} image-only byte detection`,
      detectMediaType({ data, topLevelType: 'image' }),
      sample.mediaType,
    );
    check(
      `${sample.name} generic base64 detection`,
      detectMediaType({ data: sample.base64 }),
      sample.mediaType,
    );
    check(
      `${sample.name} image-only base64 detection`,
      detectMediaType({ data: sample.base64, topLevelType: 'image' }),
      sample.mediaType,
    );

    let uploadedMediaType: string | undefined;
    const files: FilesV4 = {
      specificationVersion: 'v4',
      provider: 'synthetic',
      async uploadFile({ mediaType }) {
        uploadedMediaType = mediaType;
        return {
          warnings: [],
          providerReference: {
            synthetic: `${sample.name.toLowerCase()}-image`,
          },
        };
      },
    };

    await uploadFile({
      api: files,
      data,
      filename: `blue.${sample.mediaType.slice(6)}`,
    });
    check(
      `${sample.name} inferred upload media type`,
      uploadedMediaType,
      sample.mediaType,
    );

    let generatedInputMediaType: string | undefined;
    const model: ImageModelV4 = {
      specificationVersion: 'v4',
      provider: 'synthetic',
      modelId: 'synthetic-image-model',
      maxImagesPerCall: 1,
      async doGenerate({ files }) {
        generatedInputMediaType =
          files?.[0]?.type === 'file' ? files[0].mediaType : undefined;
        return {
          images: [data],
          warnings: [],
          response: {
            timestamp: new Date(0),
            modelId: 'synthetic-image-model',
            headers: {},
          },
        };
      },
    };

    const result = await generateImage({
      model,
      prompt: { text: 'Return the supplied image.', images: [data] },
      maxRetries: 0,
    });
    check(
      `${sample.name} generateImage input media type`,
      generatedInputMediaType,
      sample.mediaType,
    );
    check(
      `${sample.name} generateImage output media type`,
      result.image.mediaType,
      sample.mediaType,
    );
  }

  const avif32ByteHeader = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
  ]);
  if (
    detectMediaType({
      data: avif32ByteHeader,
      topLevelType: 'image',
    }) !== 'image/avif'
  ) {
    throw new Error('Control failure: 32-byte AVIF signature was not detected');
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    throw new Error(
      'Issue #21092 reproduced: valid 28-byte AVIF/HEIC images are assigned incorrect media types',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
