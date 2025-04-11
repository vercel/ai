import { z } from 'zod';

type UploadAssemblyAIFileOptions = {
  audio: Uint8Array | string;
  mediaType: string;
  apiKey: string;
  fetch?: typeof fetch;
};

export async function uploadAssemblyAIFile({
  audio,
  mediaType,
  apiKey,
  fetch: customFetch = fetch,
}: UploadAssemblyAIFileOptions): Promise<string> {
  const response = await customFetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': mediaType || 'application/octet-stream',
    },
    body: audio,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `AssemblyAI upload failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json();

  // Validate the response
  const schema = z.object({
    upload_url: z.string(),
  });

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Invalid response from AssemblyAI: ${result.error.message}`,
    );
  }

  return result.data.upload_url;
}
