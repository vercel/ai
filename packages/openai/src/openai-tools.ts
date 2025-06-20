import { fileSearch } from './tool/file-search';
import { webSearchPreview } from './tool/web-search-preview';

export const openaiTools = {
  /**
   * Creates a file search tool that gives the model access to search through uploaded files in vector stores.
   * Must have name "file_search".
   *
   * @param vectorStoreIds - List of vector store IDs to search through. If not provided, searches all available vector stores.
   * @param maxResults - Maximum number of search results to return. Defaults to 10.
   * @param searchType - Type of search to perform. Defaults to 'auto'.
   */
  fileSearch,

  /**
   * Creates a web search preview tool that gives the model access to search the web.
   * Must have name "web_search_preview".
   *
   * @param searchContextSize - Search context size to use for the web search.
   * @param userLocation - User location information to provide geographically relevant search results.
   */
  webSearchPreview,
};
