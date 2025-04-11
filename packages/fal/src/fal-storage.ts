type UploadFalAudioOptions = {
  audio: Uint8Array | Buffer;
  mediaType: string;
  apiKey: string;
};

export async function uploadFalAudio({
  audio,
  mediaType,
  apiKey,
}: UploadFalAudioOptions): Promise<string> {
  // Create a Blob from the audio data
  const blob = new Blob([audio], { type: mediaType || 'audio/mpeg' });

  // Get file extension from media type
  const getExtension = (contentType: string): string => {
    const fileType = contentType.split('/')[1];
    return fileType?.split(/[-;]/)[0] || 'bin';
  };

  // Generate filename with timestamp and extension
  const filename = `${Date.now()}.${getExtension(mediaType)}`;

  // Initiate upload
  const response = await fetch(
    'https://fal.run/storage/upload/initiate?storage_type=fal-cdn-v3',
    {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content_type: mediaType,
        file_name: filename,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to initiate upload: ${response.statusText}`);
  }

  const { upload_url: uploadUrl, file_url: fileUrl } = await response.json();

  // Upload the file
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: {
      'Content-Type': mediaType,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
  }

  return fileUrl;
}
