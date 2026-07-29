export type MediaKind = 'image' | 'audio' | 'video' | 'file';

export interface MediaPreviewData {
  filename?: string;
  kind: MediaKind;
  mediaType: string;
  source?: string;
  sourceType?: 'inline' | 'remote';
}

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

function getSafeSource({
  source,
  mediaType,
}: {
  source: unknown;
  mediaType: string;
}): Pick<MediaPreviewData, 'source' | 'sourceType'> {
  if (typeof source !== 'string') {
    return {};
  }

  if (source.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,/i.exec(source);
    const sourceMediaType = match?.[1]?.toLowerCase();
    const declaredTopLevelType = mediaType.toLowerCase().split('/')[0];
    if (
      sourceMediaType == null ||
      (sourceMediaType !== mediaType.toLowerCase() &&
        sourceMediaType.split('/')[0] !== declaredTopLevelType) ||
      !safeInlineMediaTypes.has(sourceMediaType)
    ) {
      return {};
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
    if (inlineMediaType == null) {
      return {};
    }

    return {
      source: `data:${inlineMediaType};base64,${source}`,
      sourceType: 'inline',
    };
  }
}

function getFileData(
  value: Record<string, unknown>,
): Pick<MediaPreviewData, 'source' | 'sourceType'> {
  const mediaType =
    typeof value.mediaType === 'string' ? value.mediaType : undefined;
  if (mediaType == null) {
    return {};
  }

  const data = value.data;
  if (isRecord(data)) {
    if (data.type === 'data') {
      return getSafeSource({ source: data.data, mediaType });
    }
    if (data.type === 'url') {
      return getSafeSource({ source: data.url, mediaType });
    }
    return {};
  }

  return getSafeSource({ source: data, mediaType });
}

function parseMediaPart(value: unknown): MediaPreviewData | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }

  if (value.type === 'file' || value.type === 'reasoning-file') {
    const mediaType =
      typeof value.mediaType === 'string' ? value.mediaType : undefined;
    if (mediaType == null) {
      return undefined;
    }

    return {
      filename: typeof value.filename === 'string' ? value.filename : undefined,
      kind: getKind(mediaType),
      mediaType,
      ...getFileData(value),
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
      ...getSafeSource({ source, mediaType }),
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
      ...getSafeSource({ source: value.data, mediaType }),
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
      ...getSafeSource({ source: value.url, mediaType }),
    };
  }

  return undefined;
}

export function findMediaPreviews(value: unknown): MediaPreviewData[] {
  const previews: MediaPreviewData[] = [];

  function visit(current: unknown) {
    const preview = parseMediaPart(current);
    if (preview != null) {
      previews.push(preview);
      return;
    }

    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    if (isRecord(current)) {
      Object.values(current).forEach(visit);
    }
  }

  visit(value);
  return previews;
}
