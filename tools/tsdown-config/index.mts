export const tsdownBaseConfig = {
  target: 'es2022' as const,
  tsconfig: 'tsconfig.build.json',
  /*
   * Package tsconfigs emit declarations only so type checks cannot overwrite
   * runtime bundles. Builds override that setting; the declaration plugin
   * explicitly requests declaration-only output through the TypeScript API.
   */
  dts: {
    compilerOptions: {
      emitDeclarationOnly: false,
    },
  },
  sourcemap: true,
  fixedExtension: false,
};
