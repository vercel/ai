module.exports = {
  root: true,
  // This tells ESLint to load the config from the package `eslint-config-vercel-ai`
  extends: ['vercel-ai'],
  settings: {
    next: {
      rootDir: ['apps/*/'],
    },
  },
};
