import {
  GeneratedFile,
  DefaultGeneratedFile,
} from '../generate-text/generated-file';

/**
 * A generated audio file.
 */
export interface GeneratedAudioFile extends GeneratedFile {
  /**
   * Audio format of the file (e.g., 'mp3', 'wav', etc.)
   */
  readonly format: string;
}

export class DefaultGeneratedAudioFile
  extends DefaultGeneratedFile
  implements GeneratedAudioFile
{
  readonly format: string;

  constructor({
    data,
    mimeType,
  }: {
    data: string | Uint8Array;
    mimeType: string;
  }) {
    super({ data, mimeType });
    let format = 'mp3';

    // If format is not provided, try to determine it from the mimeType
    if (mimeType) {
      const mimeTypeParts = mimeType.split('/');

      if (mimeTypeParts.length === 2) {
        // Handle special cases for audio formats
        if (mimeType !== 'audio/mpeg') {
          format = mimeTypeParts[1];
        }
      }
    }

    if (!format) {
      throw new Error(
        'Audio format must be provided or determinable from mimeType',
      );
    }

    this.format = format;
  }
}

export class DefaultGeneratedAudioFileWithType extends DefaultGeneratedAudioFile {
  readonly type = 'audio';

  constructor(options: {
    data: string | Uint8Array;
    mimeType: string;
    format: string;
  }) {
    super(options);
  }
}
