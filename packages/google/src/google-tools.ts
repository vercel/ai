import { googleSearch } from './tool/google-search';
import { urlContext } from './tool/url-context';

export const googleTools = {
  /**
   * Creates a Google search tool that gives Google direct access to real-time web content.
   * Must have name "google_search".
   */
  googleSearch,

  /**
   * Creates a URL context tool that gives Google direct access to real-time web content.
   * Must have name "url_context".
   */
  urlContext,
};
