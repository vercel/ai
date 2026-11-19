/**
 * Compiles the gts test files.
 *
 * The published package is plain TypeScript built by tsdown,
 * so this config is only for the tests.
 */
const { buildMacros } = require('@embroider/macros/babel');

const macros = buildMacros();

module.exports = {
  plugins: [
    [
      '@babel/plugin-transform-typescript',
      {
        allExtensions: true,
        allowDeclareFields: true,
        onlyRemoveTypeImports: true,
      },
    ],
    [
      'babel-plugin-ember-template-compilation',
      {
        transforms: macros.templateMacros,
      },
    ],
  ].concat(macros.babelMacros),

  generatorOpts: {
    compact: false,
  },
};
