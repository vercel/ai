import { JSONValue } from './json-value';

export type LanguageModelV2Source = LanguageModelV2SourceCommon &
  (
    | {
        kind: 'web';
      }
    | {
        kind: 'document';

        /**
         * The path to the document (if available)
         */
        path: string | undefined;

        /**
         * The page number of the source.
         */
        page: number | undefined;

        /**
         * The start index of the source.
         */
        startIndex: number | undefined;

        /**
         * The end index of the source.
         */
        endIndex: number | undefined;
      }
    | {
        kind: 'other';
      }
  );

type LanguageModelV2SourceCommon = {
  /**
   * The title of the source.
   */
  title: string;

  /**
   * A preview text of the source that can be used to display in a UI.
   */
  previewText: string | undefined;

  /**
   * The URL of the source.
   */
  url: string | undefined;

  /**
   * Custom metadata that can be attached to the source.
   */
  metadata: Record<string, JSONValue>;
};
