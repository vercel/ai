// Keep these temporary while the documentation domains move between projects.
export const versionHostRedirects = ['v5', 'v6'].flatMap(version =>
  [
    {
      source: '/',
      destination: `https://ai-sdk.dev/${version}/docs/introduction`,
    },
    // An explicit version in the path takes precedence over the hostname.
    {
      source: '/:version(v[4-7])/:path*',
      destination: 'https://ai-sdk.dev/:version/:path*',
    },
    {
      source: '/:path*',
      destination: `https://ai-sdk.dev/${version}/:path*`,
    },
  ].map(redirect => ({
    ...redirect,
    has: [{ type: 'host' as const, value: `${version}\\.ai-sdk\\.dev` }],
    permanent: false,
  })),
);
