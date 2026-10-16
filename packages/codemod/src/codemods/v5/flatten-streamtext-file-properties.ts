import { createTransformer } from '../lib/create-transformer';

// TextStreamFilePart is `{ type: 'file', file: GeneratedFile }`. Nested
// `file.mediaType` is the streamText shape; stripping `.file` reads undefined.
export default createTransformer((_fileInfo, _api, _options, _context) => {});
