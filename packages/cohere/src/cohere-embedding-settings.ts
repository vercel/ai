export type CohereEmbeddingModelId =
  | 'embed-english-v3.0'
  | 'embed-multilingual-v3.0'
  | 'embed-english-light-v3.0'
  | 'embed-multilingual-light-v3.0'
  | 'embed-english-v2.0'
  | 'embed-english-light-v2.0'
  | 'embed-multilingual-v2.0'
  | (string & {});

export interface CohereEmbeddingSettings {
  /**
   * Specifies the type of input passed to the model. Default is `search_query`.
   *
   * - "search_document": Used for embeddings stored in a vector database for search use-cases.
   * - "search_query": Used for embeddings of search queries run against a vector DB to find relevant documents.
   * - "classification": Used for embeddings passed through a text classifier.
   * - "clustering": Used for embeddings run through a clustering algorithm.
   */
  inputType?:
    | 'search_document'
    | 'search_query'
    | 'classification'
    | 'clustering';

  /**
   * Specifies how the API will handle inputs longer than the maximum token length.
   * Default is `END`.
   *
   * - "NONE": If selected, when the input exceeds the maximum input token length will return an error.
   * - "START": Will discard the start of the input until the remaining input is exactly the maximum input token length for the model.
   * - "END": Will discard the end of the input until the remaining input is exactly the maximum input token length for the model.
   */
  truncate?: 'NONE' | 'START' | 'END';
}
