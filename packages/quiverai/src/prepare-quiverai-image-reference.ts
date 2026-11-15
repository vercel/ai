import { InvalidArgumentError } from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  detectMediaType,
} from '@ai-sdk/provider-utils';

const MAX_REFERENCE_BASE64_LENGTH = 16_777_216;
const MAX_REFERENCE_BYTES = 12_582_912;
const supportedReferenceMediaTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);

export type QuiverAIImageReference =
  | { url: string }
  | {
      /**
       * Base64-encoded image data without a data URL prefix.
       */
      base64: string;
    };

export type QuiverAIImageReferenceInput =
  | string
  | URL
  | Uint8Array
  | ArrayBuffer;

/**
 * Converts URL, binary, data URL, or base64 image input into the JSON-safe
 * reference shape accepted by QuiverAI provider options.
 */
export function prepareQuiverAIImageReference(
  input: QuiverAIImageReferenceInput,
): QuiverAIImageReference {
  if (input instanceof URL) {
    return { url: validateQuiverAIImageUrl(input.toString()) };
  }

  if (typeof input === 'string') {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
      return { url: validateQuiverAIImageUrl(input) };
    }

    if (input.startsWith('data:')) {
      const match = /^data:([^;,]+);base64,(.+)$/s.exec(input);
      if (match == null || !supportedReferenceMediaTypes.has(match[1])) {
        throw new InvalidArgumentError({
          argument: 'input',
          message:
            'QuiverAI reference image data URLs must use base64 encoding and a supported image media type.',
        });
      }

      validateQuiverAIReferenceBase64(match[2], 'input');
      return { base64: match[2] };
    }

    validateQuiverAIReferenceBase64(input, 'input');
    return { base64: input };
  }

  const data =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input);
  validateQuiverAIReferenceBytes(data, 'input');
  return { base64: convertUint8ArrayToBase64(data) };
}

export function validateQuiverAIImageUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidArgumentError({
      argument: 'url',
      message: 'QuiverAI image URLs must be valid HTTP or HTTPS URLs.',
    });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidArgumentError({
      argument: 'url',
      message: 'QuiverAI image URLs must use HTTP or HTTPS.',
    });
  }

  return parsed.toString();
}

export function validateQuiverAIReferenceBase64(
  base64: string,
  argument: string,
): void {
  if (base64.length === 0 || base64.length > MAX_REFERENCE_BASE64_LENGTH) {
    throw new InvalidArgumentError({
      argument,
      message: `QuiverAI reference images must contain 1-${MAX_REFERENCE_BASE64_LENGTH} base64 characters.`,
    });
  }

  let data: Uint8Array;
  try {
    data = convertBase64ToUint8Array(base64);
  } catch (cause) {
    throw new InvalidArgumentError({
      argument,
      message: 'QuiverAI reference image data must be valid base64.',
      cause,
    });
  }

  validateQuiverAIReferenceBytes(data, argument);
}

function validateQuiverAIReferenceBytes(
  data: Uint8Array,
  argument: string,
): void {
  if (data.length === 0 || data.length > MAX_REFERENCE_BYTES) {
    throw new InvalidArgumentError({
      argument,
      message: `QuiverAI reference images must decode to 1-${MAX_REFERENCE_BYTES} bytes.`,
    });
  }

  const mediaType = isSvg(data)
    ? 'image/svg+xml'
    : detectMediaType({ data, topLevelType: 'image' });

  if (mediaType == null || !supportedReferenceMediaTypes.has(mediaType)) {
    throw new InvalidArgumentError({
      argument,
      message:
        'QuiverAI reference images must be PNG, JPEG, WebP, GIF, or SVG data.',
    });
  }
}

function isSvg(data: Uint8Array): boolean {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return false;
  }

  const normalized = text.replace(/^\uFEFF/, '').trim();
  return (
    /^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)?(?:<!DOCTYPE[\s\S]*?>\s*)?<svg[\s>]/i.test(
      normalized,
    ) &&
    (/<\/svg>\s*$/i.test(normalized) ||
      /<svg(?:\s[^>]*)?\/>\s*$/is.test(normalized))
  );
}
