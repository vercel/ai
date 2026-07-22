const MAX_ID3_TAG_BYTES = 128 * 1024;
const SIGNATURE_BYTES = 18;
const MAX_BOUNDED_BASE64_CHARS =
  Math.ceil((10 + MAX_ID3_TAG_BYTES + SIGNATURE_BYTES) / 3) * 4;
const LARGE_ATTACHMENT_BYTES = 1024 * 1024;
const FAILURE_SIGNAL =
  'ISSUE #17709 REPRODUCED: ID3-prefixed media sniffing processed attachment-sized data';

function encodeSyncSafe(size: number): [number, number, number, number] {
  return [
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  ];
}

function createId3PrefixedMp3({
  tagSize,
  totalSize,
}: {
  tagSize: number;
  totalSize: number;
}): Uint8Array {
  const frameOffset = 10 + tagSize;
  const bytes = new Uint8Array(Math.max(totalSize, frameOffset + 2));
  bytes.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00], 0);
  bytes.set(encodeSyncSafe(tagSize), 6);
  bytes.set([0xff, 0xfb], frameOffset);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function main() {
  const originalAtob = globalThis.atob;
  const decodedBase64Lengths: number[] = [];

  globalThis.atob = input => {
    decodedBase64Lengths.push(input.length);
    return originalAtob(input);
  };

  const {
    audioMediaTypeSignatures,
    detectMediaType,
    imageMediaTypeSignatures,
    videoMediaTypeSignatures,
  } = await import('../../../../packages/ai/src/util/detect-media-type');
  const { convertToLanguageModelV3DataContent } =
    await import('../../../../packages/ai/src/prompt/data-content');

  const decodeLengthsFor = (run: () => unknown) => {
    decodedBase64Lengths.length = 0;
    const result = run();
    return { result, lengths: [...decodedBase64Lengths] };
  };

  const formatChecks = [
    {
      name: 'PNG',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      signatures: imageMediaTypeSignatures,
      expected: 'image/png',
    },
    {
      name: 'JPEG',
      data: new Uint8Array([0xff, 0xd8]),
      signatures: imageMediaTypeSignatures,
      expected: 'image/jpeg',
    },
    {
      name: 'WEBP',
      data: new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]),
      signatures: imageMediaTypeSignatures,
      expected: 'image/webp',
    },
    {
      name: 'WAV',
      data: new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      ]),
      signatures: audioMediaTypeSignatures,
      expected: 'audio/wav',
    },
  ] as const;

  for (const check of formatChecks) {
    const base64 = toBase64(check.data);
    const observation = decodeLengthsFor(() =>
      detectMediaType({
        data: base64,
        signatures: check.signatures,
      }),
    );
    if (observation.result !== check.expected) {
      throw new Error(
        `Control failed: ${check.name} was ${String(observation.result)}`,
      );
    }
    if (Math.max(0, ...observation.lengths) > 24) {
      throw new Error(
        `Control failed: ${check.name} decoded more than 24 base64 characters`,
      );
    }
  }

  const largeMp3 = new Uint8Array(LARGE_ATTACHMENT_BYTES);
  largeMp3.set([0xff, 0xfb], 0);
  const baseline = decodeLengthsFor(() =>
    detectMediaType({
      data: toBase64(largeMp3),
      signatures: audioMediaTypeSignatures,
    }),
  );

  const id3PrefixedMp3 = createId3PrefixedMp3({
    tagSize: 0,
    totalSize: LARGE_ATTACHMENT_BYTES,
  });
  const id3Base64 = toBase64(id3PrefixedMp3);
  const base64BySignatureSet = [
    ['image', imageMediaTypeSignatures],
    ['audio', audioMediaTypeSignatures],
    ['video', videoMediaTypeSignatures],
  ] as const;
  const id3DecodeObservations = base64BySignatureSet.map(
    ([signatureSet, signatures]) => ({
      signatureSet,
      ...decodeLengthsFor(() =>
        detectMediaType({ data: id3Base64, signatures }),
      ),
    }),
  );

  let copiedRawBytes = 0;
  class TrackingUint8Array extends Uint8Array {
    override slice(start?: number, end?: number): Uint8Array {
      const normalizedStart = start ?? 0;
      const normalizedEnd = end ?? this.length;
      copiedRawBytes += Math.max(0, normalizedEnd - normalizedStart);
      return super.slice(start, end);
    }
  }
  const trackedRawInput = new TrackingUint8Array(id3PrefixedMp3.length);
  trackedRawInput.set(id3PrefixedMp3);
  const rawResult = detectMediaType({
    data: trackedRawInput,
    signatures: audioMediaTypeSignatures,
  });

  const boundaryResults = [MAX_ID3_TAG_BYTES, MAX_ID3_TAG_BYTES + 1].map(
    tagSize => {
      const bytes = createId3PrefixedMp3({
        tagSize,
        totalSize: 10 + tagSize + 2,
      });
      return {
        tagSize,
        raw: detectMediaType({
          data: bytes,
          signatures: audioMediaTypeSignatures,
        }),
        base64: detectMediaType({
          data: toBase64(bytes),
          signatures: audioMediaTypeSignatures,
        }),
      };
    },
  );

  const malformed = createId3PrefixedMp3({
    tagSize: 0,
    totalSize: LARGE_ATTACHMENT_BYTES,
  });
  malformed.set([0x80, 0x80, 0x80, 0x80], 6);
  const malformedObservation = decodeLengthsFor(() =>
    detectMediaType({
      data: toBase64(malformed),
      signatures: audioMediaTypeSignatures,
    }),
  );

  const base64UrlResult = detectMediaType({
    data: id3Base64.replaceAll('+', '-').replaceAll('/', '_'),
    signatures: audioMediaTypeSignatures,
  });
  const dataUrl = convertToLanguageModelV3DataContent(
    `data:audio/mpeg;base64,${id3Base64}`,
  );
  const arrayBuffer = convertToLanguageModelV3DataContent(
    id3PrefixedMp3.buffer,
  );
  const buffer = convertToLanguageModelV3DataContent(
    Buffer.from(id3PrefixedMp3),
  );
  const text = convertToLanguageModelV3DataContent('plain text input');

  const violations: string[] = [];
  const baselineDecoded = Math.max(0, ...baseline.lengths);
  if (baselineDecoded > 24) {
    violations.push(
      `non-ID3 MP3 decoded ${baselineDecoded} base64 characters instead of at most 24`,
    );
  }

  for (const observation of id3DecodeObservations) {
    const decoded = Math.max(0, ...observation.lengths);
    if (decoded > MAX_BOUNDED_BASE64_CHARS) {
      violations.push(
        `${observation.signatureSet} detection decoded ${decoded} of ${id3Base64.length} base64 characters`,
      );
    }
  }

  if (copiedRawBytes > 10 + MAX_ID3_TAG_BYTES + SIGNATURE_BYTES) {
    violations.push(
      `raw Uint8Array detection copied ${copiedRawBytes} of ${trackedRawInput.length} bytes`,
    );
  }

  const inclusiveBoundary = boundaryResults[0];
  if (
    inclusiveBoundary.raw !== 'audio/mpeg' ||
    inclusiveBoundary.base64 !== 'audio/mpeg'
  ) {
    violations.push(
      'an ID3v2 tag of exactly 128 KiB was not detected consistently as audio/mpeg',
    );
  }

  const oversizedBoundary = boundaryResults[1];
  if (
    oversizedBoundary.raw !== undefined ||
    oversizedBoundary.base64 !== undefined
  ) {
    violations.push(
      `an ID3v2 tag larger than 128 KiB was scanned as ${String(oversizedBoundary.raw)} (raw) and ${String(oversizedBoundary.base64)} (base64)`,
    );
  }

  const malformedDecoded = Math.max(0, ...malformedObservation.lengths);
  if (malformedDecoded > MAX_BOUNDED_BASE64_CHARS) {
    violations.push(
      `a malformed ID3 size field decoded ${malformedDecoded} base64 characters`,
    );
  }

  if (
    baseline.result !== 'audio/mpeg' ||
    id3DecodeObservations.find(({ signatureSet }) => signatureSet === 'audio')
      ?.result !== 'audio/mpeg' ||
    rawResult !== 'audio/mpeg'
  ) {
    throw new Error('Control failed: MP3 detection result changed');
  }

  if (
    base64UrlResult !== 'audio/mpeg' ||
    dataUrl.mediaType !== 'audio/mpeg' ||
    dataUrl.data !== id3Base64 ||
    !(arrayBuffer.data instanceof Uint8Array) ||
    !(buffer.data instanceof Uint8Array) ||
    text.data !== 'plain text input'
  ) {
    throw new Error('Control failed: normalized input behavior changed');
  }

  console.log(
    JSON.stringify(
      {
        bound: {
          maxDecodedBase64Characters: MAX_BOUNDED_BASE64_CHARS,
          maxInspectedBytes: 10 + MAX_ID3_TAG_BYTES + SIGNATURE_BYTES,
        },
        baseline: {
          result: baseline.result,
          decodedBase64Characters: baselineDecoded,
        },
        id3BySignatureSet: id3DecodeObservations.map(
          ({ signatureSet, result, lengths }) => ({
            signatureSet,
            result,
            decodedBase64Characters: Math.max(0, ...lengths),
          }),
        ),
        raw: {
          result: rawResult,
          copiedBytes: copiedRawBytes,
          attachmentBytes: trackedRawInput.length,
        },
        boundaries: boundaryResults,
        malformed: {
          result: malformedObservation.result,
          decodedBase64Characters: malformedDecoded,
        },
      },
      null,
      2,
    ),
  );

  if (violations.length > 0) {
    throw new Error(`${FAILURE_SIGNAL}\n- ${violations.join('\n- ')}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
