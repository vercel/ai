/** @type {import('next').NextConfig} */
const nextConfig = {
  // `ws` does a guarded `require('bufferutil')` for an optional native
  // addon used to mask large WebSocket frames. Next.js's bundler
  // replaces the `require` with a webpack stub that resolves to an
  // empty module instead of throwing, so the try/catch never falls
  // back to the JS implementation and frame masking blows up with
  // `bufferUtil.mask is not a function` on any payload ≥ 48 bytes.
  // `WS_NO_BUFFER_UTIL` tells `ws` itself to skip the optional require
  // entirely (verified in `node_modules/ws/lib/buffer-util.js`).
  env: {
    WS_NO_BUFFER_UTIL: '1',
  },
};

module.exports = nextConfig;
