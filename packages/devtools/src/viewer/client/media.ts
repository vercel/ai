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

  if (normalizedMediaType !== 'image') {
    return undefined;
  }

  if (data.startsWith('iVBOR')) return 'image/png';
  if (data.startsWith('/9j/')) return 'image/jpeg';
  if (data.startsWith('R0lGOD')) return 'image/gif';
  if (data.startsWith('UklGR')) return 'image/webp';
  if (data.startsWith('Qk')) return 'image/bmp';

  return undefined;
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
    return url.protocol === 'http:' || url.protocol === 'https:'
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
          : 'application/octet-stream';

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
