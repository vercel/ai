import { z } from 'zod/v4';

export const deepseekFilePartProviderOptions = z.object({
  /**
   * Controls how DeepSeek processes an image sent as an `image_url` part.
   *
   * @see https://api-docs.deepseek.com/api/create-chat-completion/
   */
  imageDetail: z.enum(['low', 'high', 'original', 'auto']).optional(),

  /**
   * Sends inline image data as a DeepSeek `file` part using `file_data`
   * instead of an `image_url` data URL. When set, the file part's filename
   * is preserved.
   *
   * This option only applies to inline image data. It cannot be combined
   * with `imageDetail`.
   */
  fileData: z.literal(true).optional(),
});

export type DeepSeekFilePartProviderOptions = z.infer<
  typeof deepseekFilePartProviderOptions
>;
