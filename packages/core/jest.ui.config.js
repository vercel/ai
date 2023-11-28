module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFiles: ['./jest.polyfills.js'],

  // required for Vue testing library:
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
  transform: {
    '^.+\\.vue$': '@vue/vue3-jest',
  },
};
