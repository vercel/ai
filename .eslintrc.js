module.exports = {
  root: false,
  // This tells ESLint to load the config from the package `eslint-config-vercel-ai`
  extends: ['vercel-ai'],
  settings: {
    next: {
      rootDir: ['apps/*/'],
    },
  },
};
