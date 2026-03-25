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

function extractPhotaMeta(
  providerMetadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const meta = (providerMetadata as Record<string, unknown> | undefined)?.phota;
  if (meta == null || typeof meta !== 'object') {
    throw new Error('Missing Phota provider metadata.');
  }
  return meta as Record<string, unknown>;
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
  const meta = extractPhotaMeta(providerMetadata);
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
  const meta = extractPhotaMeta(providerMetadata);
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
  const meta = extractPhotaMeta(providerMetadata);
  const knownSubjects = meta.knownSubjects as
    | { counts: Record<string, number> }
    | undefined;
  return {
    ...(knownSubjects != null && { knownSubjects }),
  };
}
