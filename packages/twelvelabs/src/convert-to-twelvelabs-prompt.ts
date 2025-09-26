import { LanguageModelV2Prompt, InvalidPromptError } from '@ai-sdk/provider';

export interface TwelveLabsPromptData {
  prompt: string;
  videoInfo?: {
    videoId?: string; // Existing video ID from providerOptions
    videoUrl?: string; // Video URL to upload
    videoData?: Uint8Array; // Raw video data to upload
    mediaType?: string; // Video MIME type
  };
}

export function convertToTwelveLabsPrompt(
  prompt: LanguageModelV2Prompt,
): TwelveLabsPromptData {
  let textPrompt = '';
  let videoInfo: TwelveLabsPromptData['videoInfo'] | undefined;

  // Process messages to extract text and video
  for (const message of prompt) {
    if (message.role === 'user') {
      if (typeof message.content === 'string') {
        textPrompt = message.content;
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') {
            textPrompt += (textPrompt ? ' ' : '') + part.text;
          } else if (part.type === 'file' && isVideoMediaType(part.mediaType)) {
            // Check for existing video ID in provider options
            const providerOptions = part.providerOptions as any;
            if (providerOptions?.twelvelabs?.videoId) {
              videoInfo = {
                videoId: providerOptions.twelvelabs.videoId,
                mediaType: part.mediaType,
              };
            } else if (part.data instanceof URL) {
              videoInfo = {
                videoUrl: part.data.toString(),
                mediaType: part.mediaType,
              };
            } else if (part.data instanceof Uint8Array) {
              // Keep raw Uint8Array data
              videoInfo = {
                videoData: part.data,
                mediaType: part.mediaType,
              };
            }
          }
        }
      }
    }
  }

  if (!textPrompt) {
    throw new InvalidPromptError({
      prompt,
      message: 'No text content found in user message',
    });
  }

  return {
    prompt: textPrompt,
    videoInfo,
  };
}

function isVideoMediaType(mediaType: string): boolean {
  return (
    mediaType.startsWith('video/') ||
    ['application/x-matroska', 'application/octet-stream'].includes(mediaType)
  );
}
