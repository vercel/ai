import { createTransformer } from '../lib/create-transformer';

// `content` was replaced by `parts` for UIMessage, but ModelMessage still uses
// `content`. The previous transform only inspected call names, so it rewrote
// ModelMessage prompts passed to core and RSC generation functions. Leave
// message literals unchanged until a UIMessage context can be established.
export default createTransformer(() => {});
