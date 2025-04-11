import { z } from 'zod';

type UploadGladiaFileOptions = {
  audio: Uint8Array | string;
  mediaType: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export async function uploadGladiaFile({
  audio,
  mediaType,
  apiKey,
  fetch: customFetch = fetch,
}: UploadGladiaFileOptions): Promise<string> {
  const formData = new FormData();

  // Add the audio file to the form data
  const blob =
    typeof audio === 'string'
      ? new Blob([audio], { type: mediaType })
      : new Blob([audio], { type: mediaType });
  formData.append('file', blob);

  const response = await customFetch('https://api.gladia.io/v2/upload', {
    method: 'POST',
    headers: {
      'x-gladia-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gladia upload failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json();

  const schema = z.object({
    audio_url: z.string(),
    audio_metadata: z.object({
      id: z.string(),
      filename: z.string(),
      source: z.string(),
      extension: z.string(),
      size: z.number(),
      audio_duration: z.number(),
      number_of_channels: z.number(),
    }),
  });

  const result = schema.safeParse(data);

  if (!result.success) {
    throw new Error(`Invalid response from Gladia: ${result.error.message}`);
  }

  return result.data.audio_url;
}
