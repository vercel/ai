import assert from 'node:assert/strict';

const MAX_ID3_TAG_SIZE = 128 * 1024;
const ONE_MIB = 1024 * 1024;
const REPRODUCTION_SIGNAL =
  'ISSUE_17709_REPRODUCED: ID3 media sniffing exceeded the fixed 128 KiB scan bound and performed attachment-sized work';

function encodeSyncSafeSize(size: number): [number, number, number, number] {
  return [
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  ];
}

function createId3Attachment({
  totalSize,
  tagSize,
  signature,
}: {
  totalSize: number;
  tagSize: number;
  signature: readonly number[];
}): Uint8Array {
  const bytes = new Uint8Array(
    Math.max(totalSize, 10 + tagSize + signature.length),
  );
  bytes.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00], 0);
  bytes.set(encodeSyncSafeSize(tagSize), 6);
  bytes.set(signature, 10 + tagSize);
  return bytes;
}

class SliceObservedUint8Array extends Uint8Array {
  readonly sliceLengths: number[] = [];

  override slice(start?: number, end?: number): Uint8Array {
    const result = super.slice(start, end);
    this.sliceLengths.push(result.length);
    return result;
  }
}

function toObservedBytes(bytes: Uint8Array): SliceObservedUint8Array {
  const observed = new SliceObservedUint8Array(bytes.length);
  observed.set(bytes);
  return observed;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function main() {
  const originalAtob = globalThis.atob;
  const decodedBase64Lengths: number[] = [];

  globalThis.atob = (input: string) => {
    decodedBase64Lengths.push(input.length);
    return originalAtob(input);
  };

  try {
    const {
      audioMediaTypeSignatures,
      detectMediaType,
      imageMediaTypeSignatures,
    } = await import('../../../../packages/ai/src/util/detect-media-type');
    const { convertToLanguageModelV2DataContent } =
      await import('../../../../packages/ai/src/prompt/data-content');

    type Signatures = Parameters<typeof detectMediaType>[0]['signatures'];
    const combinedMediaTypeSignatures = [
      ...imageMediaTypeSignatures,
      ...audioMediaTypeSignatures,
    ] as unknown as Signatures;

    const nonId3Controls = [
      {
        name: 'PNG',
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        signatures: imageMediaTypeSignatures,
        expected: 'image/png',
      },
      {
        name: 'JPEG',
        bytes: new Uint8Array([0xff, 0xd8]),
        signatures: imageMediaTypeSignatures,
        expected: 'image/jpeg',
      },
      {
        name: 'WEBP',
        bytes: new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50,
        ]),
        signatures: imageMediaTypeSignatures,
        expected: 'image/webp',
      },
      {
        name: 'WAV',
        bytes: new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56,
          0x45,
        ]),
        signatures: audioMediaTypeSignatures,
        expected: 'audio/wav',
      },
    ] as const;

    for (const control of nonId3Controls) {
      assert.equal(
        detectMediaType({
          data: control.bytes,
          signatures: control.signatures,
        }),
        control.expected,
        `${control.name} raw-byte control changed`,
      );
      assert.equal(
        detectMediaType({
          data: toBase64(control.bytes),
          signatures: control.signatures,
        }),
        control.expected,
        `${control.name} base64 control changed`,
      );
    }

    const pngBase64Url = toBase64(nonId3Controls[0].bytes)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    assert.equal(
      detectMediaType({
        data: pngBase64Url,
        signatures: imageMediaTypeSignatures,
      }),
      'image/png',
      'base64url normalization changed',
    );

    const normalizedDataUrl = convertToLanguageModelV2DataContent(
      `data:image/png;base64,${toBase64(nonId3Controls[0].bytes)}`,
    );
    assert.equal(normalizedDataUrl.mediaType, 'image/png');
    assert.equal(typeof normalizedDataUrl.data, 'string');

    const arrayBuffer = nonId3Controls[0].bytes.buffer.slice(0);
    const normalizedArrayBuffer =
      convertToLanguageModelV2DataContent(arrayBuffer);
    assert.ok(normalizedArrayBuffer.data instanceof Uint8Array);
    assert.equal(normalizedArrayBuffer.data.buffer, arrayBuffer);

    const buffer = Buffer.from(nonId3Controls[0].bytes);
    assert.equal(convertToLanguageModelV2DataContent(buffer).data, buffer);
    assert.equal(
      convertToLanguageModelV2DataContent('plain text').data,
      'plain text',
    );

    decodedBase64Lengths.length = 0;
    const ordinaryLargePng = new Uint8Array(ONE_MIB);
    ordinaryLargePng.set(nonId3Controls[0].bytes);
    const ordinaryLargePngBase64 = toBase64(ordinaryLargePng);
    assert.equal(
      detectMediaType({
        data: ordinaryLargePngBase64,
        signatures: imageMediaTypeSignatures,
      }),
      'image/png',
    );
    assert.equal(
      decodedBase64Lengths.at(-1),
      24,
      'non-ID3 sniffing should decode only the normal 24-character prefix',
    );

    const pathResults: Array<{
      path: string;
      decodedCharacters: number;
      attachmentCharacters: number;
    }> = [];
    for (const path of [
      {
        name: 'image',
        signatures: imageMediaTypeSignatures,
        signature: [0x89, 0x50, 0x4e, 0x47],
        expected: 'image/png',
      },
      {
        name: 'audio',
        signatures: audioMediaTypeSignatures,
        signature: [0xff, 0xfb],
        expected: 'audio/mpeg',
      },
      {
        name: 'combined',
        signatures: combinedMediaTypeSignatures,
        signature: [0xff, 0xfb],
        expected: 'audio/mpeg',
      },
    ] as const) {
      const attachment = createId3Attachment({
        totalSize: ONE_MIB,
        tagSize: 0,
        signature: path.signature,
      });
      const base64 = toBase64(attachment);
      decodedBase64Lengths.length = 0;
      assert.equal(
        detectMediaType({
          data: base64,
          signatures: path.signatures,
        }),
        path.expected,
      );
      pathResults.push({
        path: path.name,
        decodedCharacters: decodedBase64Lengths.at(-1) ?? 0,
        attachmentCharacters: base64.length,
      });
    }

    const observedRaw = toObservedBytes(
      createId3Attachment({
        totalSize: ONE_MIB,
        tagSize: 0,
        signature: [0xff, 0xfb],
      }),
    );
    assert.equal(
      detectMediaType({
        data: observedRaw,
        signatures: audioMediaTypeSignatures,
      }),
      'audio/mpeg',
    );
    const copiedRawBytes = observedRaw.sliceLengths.at(-1) ?? 0;

    const boundaryResults = [MAX_ID3_TAG_SIZE, MAX_ID3_TAG_SIZE + 1].map(
      tagSize => {
        const bytes = createId3Attachment({
          totalSize: 10 + tagSize + 2,
          tagSize,
          signature: [0xff, 0xfb],
        });
        const rawResult = detectMediaType({
          data: bytes,
          signatures: audioMediaTypeSignatures,
        });
        const base64Result = detectMediaType({
          data: toBase64(bytes),
          signatures: audioMediaTypeSignatures,
        });
        assert.equal(
          rawResult,
          base64Result,
          `raw/base64 parity changed at ID3 tag size ${tagSize}`,
        );
        return { tagSize, rawResult, base64Result };
      },
    );

    const malformed = createId3Attachment({
      totalSize: ONE_MIB,
      tagSize: 0,
      signature: [0xff, 0xfb],
    });
    malformed.set([0xff, 0xff, 0xff, 0xff], 6);
    const malformedBase64 = toBase64(malformed);
    decodedBase64Lengths.length = 0;
    assert.doesNotThrow(() =>
      detectMediaType({
        data: malformedBase64,
        signatures: audioMediaTypeSignatures,
      }),
    );
    const malformedDecodedCharacters = decodedBase64Lengths.at(-1) ?? 0;

    const pdfResult = detectMediaType({
      data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      signatures: combinedMediaTypeSignatures,
    });

    console.log(
      JSON.stringify(
        {
          normalPrefixDecodedCharacters: 24,
          id3Paths: pathResults,
          rawAttachmentBytes: observedRaw.length,
          rawCopiedBytes: copiedRawBytes,
          boundaryResults,
          malformed: {
            attachmentCharacters: malformedBase64.length,
            decodedCharacters: malformedDecodedCharacters,
          },
          controls: {
            nonId3: nonId3Controls.map(control => control.name),
            base64url: 'image/png',
            dataUrl: normalizedDataUrl.mediaType,
            arrayBuffer: normalizedArrayBuffer.data instanceof Uint8Array,
            buffer: true,
            text: true,
            pdfOnReleaseV5: pdfResult,
          },
        },
        null,
        2,
      ),
    );

    const allId3PathsDecodedCompleteAttachments = pathResults.every(
      result => result.decodedCharacters === result.attachmentCharacters,
    );
    const rawCopiedCompleteRemainder =
      copiedRawBytes === observedRaw.length - 10;
    const scannedPastBound =
      boundaryResults[1].rawResult === 'audio/mpeg' &&
      boundaryResults[1].base64Result === 'audio/mpeg';
    const malformedDecodedCompleteAttachment =
      malformedDecodedCharacters === malformedBase64.length;

    if (
      allId3PathsDecodedCompleteAttachments &&
      rawCopiedCompleteRemainder &&
      scannedPastBound &&
      malformedDecodedCompleteAttachment
    ) {
      throw new Error(REPRODUCTION_SIGNAL);
    }

    assert.fail(
      'Issue #17709 was not reproduced: media sniffing remained within the expected fixed bound',
    );
  } finally {
    globalThis.atob = originalAtob;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
