export interface PhotaTrainMetadata {
  profileId: string;
}

export interface PhotaStatusMetadata {
  profileId: string;
  status: string;
  message?: string;
}

export interface PhotaImageMetadata {
  knownSubjects?: {
    counts: Record<string, number>;
  };
}

function extractFirstImageMeta(
  providerMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const phota = (providerMetadata as Record<string, unknown> | undefined)
    ?.phota;
  if (phota == null || typeof phota !== 'object') {
    throw new Error('Missing Phota provider metadata.');
  }
  const images = (phota as Record<string, unknown>).images;
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('Missing Phota provider metadata images.');
  }
  const first = images[0];
  if (first == null || typeof first !== 'object') {
    throw new Error('Missing Phota provider metadata in images[0].');
  }
  return first as Record<string, unknown>;
}

/**
 * Extract the profile ID returned by the `train` model.
 *
 * ```ts
 * const result = await generateImage({ model: phota.image('train'), ... });
 * const { profileId } = getPhotaTrainResult(result.providerMetadata);
 * ```
 */
export function getPhotaTrainResult(
  providerMetadata: Record<string, unknown> | undefined,
): PhotaTrainMetadata {
  const meta = extractFirstImageMeta(providerMetadata);
  const profileId = meta.profileId;
  if (typeof profileId !== 'string') {
    throw new Error('Missing profileId in Phota train metadata.');
  }
  return { profileId };
}

/**
 * Extract the training status returned by the `status` model.
 *
 * ```ts
 * const result = await generateImage({ model: phota.image('status'), ... });
 * const { status, profileId } = getPhotaStatusResult(result.providerMetadata);
 * ```
 */
export function getPhotaStatusResult(
  providerMetadata: Record<string, unknown> | undefined,
): PhotaStatusMetadata {
  const meta = extractFirstImageMeta(providerMetadata);
  const profileId = meta.profileId;
  const status = meta.status;
  if (typeof profileId !== 'string' || typeof status !== 'string') {
    throw new Error('Missing profileId or status in Phota status metadata.');
  }
  return {
    profileId,
    status,
    ...(typeof meta.message === 'string' && { message: meta.message }),
  };
}

/**
 * Extract image-specific metadata (known subjects) from generate/edit/enhance results.
 *
 * ```ts
 * const result = await generateImage({ model: phota.image('generate'), ... });
 * const meta = getPhotaImageMetadata(result.providerMetadata);
 * ```
 */
export function getPhotaImageMetadata(
  providerMetadata: Record<string, unknown> | undefined,
): PhotaImageMetadata {
  const meta = extractFirstImageMeta(providerMetadata);
  const knownSubjects = meta.knownSubjects as
    | { counts: Record<string, number> }
    | undefined;
  return {
    ...(knownSubjects != null && { knownSubjects }),
  };
}
