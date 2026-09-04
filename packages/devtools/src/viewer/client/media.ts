export type MediaKind = 'image' | 'audio' | 'video' | 'file';

export interface MediaPreviewData {
  filename?: string;
  kind: MediaKind;
  mediaType: string;
  source?: string;
  sourceType?: 'inline' | 'remote';
  unavailableReason?: string;
}

export interface MediaPreviewLimits {
  maxCount: number;
  maxDepth: number;
  maxInlineBytes: number;
  maxNodes: number;
}

export const DEFAULT_MEDIA_PREVIEW_LIMITS: MediaPreviewLimits = {
  maxCount: 8,
  maxDepth: 12,
  maxInlineBytes: 5 * 1024 * 1024,
  maxNodes: 1000,
};

const safeInlineMediaTypes = new Set([
  'audio/m4a',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/x-icon',
  'video/mp4',
  'video/ogg',
  'video/webm',
]);

const mediaTypesByExtension: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  png: 'image/png',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function getKind(mediaType: string): MediaKind {
  const topLevelType = mediaType.toLowerCase().split('/')[0];
  return topLevelType === 'image' ||
    topLevelType === 'audio' ||
    topLevelType === 'video'
    ? topLevelType
    : 'file';
}

function getBase64Prefix(data: string, maxBytes = 16): number[] {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bitCount = 0;

  for (const character of data) {
    if (character === '=') break;

    const value = alphabet.indexOf(character);
    if (value === -1) return [];

    buffer = (buffer << 6) | value;
    bitCount += 6;

    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((buffer >> bitCount) & 0xff);
      if (bytes.length >= maxBytes) break;
    }
  }

  return bytes;
}

function hasBytes(bytes: number[], expected: number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function detectInlineMediaType({
  data,
  mediaType,
}: {
  data: string;
  mediaType: string;
}): string | undefined {
  const normalizedMediaType = mediaType.toLowerCase();
  if (safeInlineMediaTypes.has(normalizedMediaType)) {
    return normalizedMediaType;
  }

  const bytes = getBase64Prefix(data);

  if (normalizedMediaType === 'image') {
    if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
    if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (hasBytes(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
    if (
      hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
    ) {
      return 'image/webp';
    }
    if (hasBytes(bytes, [0x42, 0x4d])) return 'image/bmp';
  }

  if (normalizedMediaType === 'audio') {
    if (hasBytes(bytes, [0x49, 0x44, 0x33])) return 'audio/mpeg';
    if (bytes[0] === 0xff && bytes[1] != null && (bytes[1] & 0xe0) === 0xe0) {
      return 'audio/mpeg';
    }
    if (
      hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      hasBytes(bytes, [0x57, 0x41, 0x56, 0x45], 8)
    ) {
      return 'audio/wav';
    }
    if (hasBytes(bytes, [0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg';
    if (hasBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm';
    if (hasBytes(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return 'audio/mp4';
  }

  if (normalizedMediaType === 'video') {
    if (hasBytes(bytes, [0x4f, 0x67, 0x67, 0x53])) return 'video/ogg';
    if (hasBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
    if (hasBytes(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return 'video/mp4';
  }

  return undefined;
}

function inferMediaTypeFromUrl(source: unknown): string | undefined {
  if (typeof source !== 'string') return undefined;

  try {
    const extension = new URL(source).pathname.split('.').pop()?.toLowerCase();
    return extension == null ? undefined : mediaTypesByExtension[extension];
  } catch {
    return undefined;
  }
}

function getBase64ByteLength(value: string): number | undefined {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    return undefined;
  }

  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function getSafeSource({
  source,
  mediaType,
  maxInlineBytes,
}: {
  source: unknown;
  mediaType: string;
  maxInlineBytes: number;
}): Pick<MediaPreviewData, 'source' | 'sourceType' | 'unavailableReason'> {
  if (typeof source !== 'string') {
    return {};
  }

  if (source.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.*)$/i.exec(source);
    const sourceMediaType = match?.[1]?.toLowerCase();
    const byteLength =
      match?.[2] == null ? undefined : getBase64ByteLength(match[2]);
    const declaredTopLevelType = mediaType.toLowerCase().split('/')[0];
    if (
      sourceMediaType == null ||
      byteLength == null ||
      (sourceMediaType !== mediaType.toLowerCase() &&
        sourceMediaType.split('/')[0] !== declaredTopLevelType) ||
      !safeInlineMediaTypes.has(sourceMediaType)
    ) {
      return {};
    }

    if (byteLength > maxInlineBytes) {
      return {
        unavailableReason: `Inline preview exceeds the ${maxInlineBytes}-byte limit.`,
      };
    }

    return { source, sourceType: 'inline' };
  }

  try {
    const url = new URL(source);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === ''
      ? { source: url.toString(), sourceType: 'remote' }
      : {};
  } catch {
    const inlineMediaType = detectInlineMediaType({
      data: source,
      mediaType,
    });
    const byteLength = getBase64ByteLength(source);
    if (inlineMediaType == null || byteLength == null) {
      return {};
    }

    if (byteLength > maxInlineBytes) {
      return {
        unavailableReason: `Inline preview exceeds the ${maxInlineBytes}-byte limit.`,
      };
    }

    return {
      source: `data:${inlineMediaType};base64,${source}`,
      sourceType: 'inline',
    };
  }
}

function getFileData(
  value: Record<string, unknown>,
  maxInlineBytes: number,
): Pick<MediaPreviewData, 'source' | 'sourceType' | 'unavailableReason'> {
  const generatedFile = isRecord(value.file) ? value.file : undefined;
  const mediaType =
    typeof value.mediaType === 'string'
      ? value.mediaType
      : typeof generatedFile?.mediaType === 'string'
        ? generatedFile.mediaType
        : undefined;
  if (mediaType == null) {
    return {};
  }

  const data = value.data;
  if (isRecord(data)) {
    if (data.type === 'data') {
      return getSafeSource({ source: data.data, mediaType, maxInlineBytes });
    }
    if (data.type === 'url') {
      return getSafeSource({ source: data.url, mediaType, maxInlineBytes });
    }
    return {};
  }

  const generatedFileData =
    generatedFile?.base64 ??
    generatedFile?.base64Data ??
    generatedFile?.uint8Array ??
    generatedFile?.uint8ArrayData;

  return getSafeSource({
    source: data ?? generatedFileData,
    mediaType,
    maxInlineBytes,
  });
}

function parseMediaPart(
  value: unknown,
  maxInlineBytes: number,
): MediaPreviewData | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }

  if (value.type === 'file' || value.type === 'reasoning-file') {
    const generatedFile = isRecord(value.file) ? value.file : undefined;
    const mediaType =
      typeof value.mediaType === 'string'
        ? value.mediaType
        : typeof generatedFile?.mediaType === 'string'
          ? generatedFile.mediaType
          : undefined;
    if (mediaType == null) {
      return undefined;
    }

    return {
      filename:
        typeof value.filename === 'string'
          ? value.filename
          : typeof generatedFile?.filename === 'string'
            ? generatedFile.filename
            : undefined,
      kind: getKind(mediaType),
      mediaType,
      ...getFileData(value, maxInlineBytes),
    };
  }

  if (value.type === 'image') {
    const mediaType =
      typeof value.mediaType === 'string' ? value.mediaType : 'image/png';
    const image = value.image;
    const source =
      isRecord(image) && image.type === 'url'
        ? image.url
        : isRecord(image) && image.type === 'data'
          ? image.data
          : image;

    return {
      kind: 'image',
      mediaType,
      ...getSafeSource({ source, mediaType, maxInlineBytes }),
    };
  }

  if (
    value.type === 'media' ||
    value.type === 'file-data' ||
    value.type === 'image-data'
  ) {
    const mediaType =
      typeof value.mediaType === 'string'
        ? value.mediaType
        : value.type === 'image-data'
          ? 'image/png'
          : undefined;
    if (mediaType == null) {
      return undefined;
    }

    return {
      filename: typeof value.filename === 'string' ? value.filename : undefined,
      kind: getKind(mediaType),
      mediaType,
      ...getSafeSource({
        source: value.data,
        mediaType,
        maxInlineBytes,
      }),
    };
  }

  if (value.type === 'image-url' || value.type === 'file-url') {
    const mediaType =
      typeof value.mediaType === 'string'
        ? value.mediaType
        : value.type === 'image-url'
          ? 'image'
          : (inferMediaTypeFromUrl(value.url) ?? 'application/octet-stream');

    return {
      filename: typeof value.filename === 'string' ? value.filename : undefined,
      kind: getKind(mediaType),
      mediaType,
      ...getSafeSource({ source: value.url, mediaType, maxInlineBytes }),
    };
  }

  return undefined;
}

export function findMediaPreviews(
  value: unknown,
  limitOverrides: Partial<MediaPreviewLimits> = {},
): MediaPreviewData[] {
  const limits = { ...DEFAULT_MEDIA_PREVIEW_LIMITS, ...limitOverrides };
  const previews: MediaPreviewData[] = [];
  const visited = new WeakSet<object>();
  const pending: Array<{ value: unknown; depth: number }> = [
    { value, depth: 0 },
  ];
  let visitedNodes = 0;

  while (
    pending.length > 0 &&
    previews.length < limits.maxCount &&
    visitedNodes < limits.maxNodes
  ) {
    const { value: current, depth } = pending.pop()!;
    visitedNodes++;

    const preview = parseMediaPart(current, limits.maxInlineBytes);
    if (preview != null) {
      previews.push(preview);
      continue;
    }

    if (
      depth >= limits.maxDepth ||
      current == null ||
      typeof current !== 'object'
    ) {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const children = Array.isArray(current)
      ? current
      : isRecord(current)
        ? Object.values(current)
        : [];
    for (let index = children.length - 1; index >= 0; index--) {
      pending.push({ value: children[index], depth: depth + 1 });
    }
  }

  return previews;
}
