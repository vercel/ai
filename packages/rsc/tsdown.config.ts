import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, type TsdownPlugin } from 'tsdown';
import { removeDanglingDeclarationSourcemapComments } from '../../tools/tsdown/declaration-sourcemaps.mts';

function preserveRscClientSourcemap(): TsdownPlugin {
  return {
    name: 'preserve-rsc-client-sourcemap',
    async generateBundle(_outputOptions, bundle) {
      const chunk = bundle['rsc-client.js'];

      // The plugin is also visible to declaration generation.
      if (chunk?.type !== 'chunk') {
        return;
      }

      const mapFileName = `${chunk.fileName}.map`;

      // Prefer Rolldown's native map if external-only entries gain support.
      if (bundle[mapFileName] != null) {
        return;
      }

      const sourcePath = chunk.facadeModuleId;
      if (sourcePath == null) {
        this.error('rsc-client.js is missing its facade module');
      }

      const source = await readFile(sourcePath, 'utf8');
      const code = chunk.code.replace(/\n$/, '');
      const sourceMap = {
        version: 3,
        sources: ['../src/rsc-client.ts'],
        sourcesContent: [source],
        names: [],
        mappings: [
          'AAAA',
          ...Array(Math.max(0, code.split('\n').length - 1)).fill(''),
        ].join(';'),
      };

      chunk.code = `${code}\n//# sourceMappingURL=${basename(mapFileName)}`;
      this.emitFile({
        type: 'asset',
        fileName: mapFileName,
        originalFileName: sourcePath,
        source: JSON.stringify(sourceMap),
      });
    },
  };
}

function preserveRscValueExports(): TsdownPlugin {
  return {
    name: 'preserve-rsc-value-exports',
    generateBundle(_outputOptions, bundle) {
      const chunk = bundle['index.d.ts'];

      // This config also produces an empty JavaScript entry.
      if (chunk?.type !== 'chunk') {
        return;
      }

      const valueExport =
        /^export type \{(?=[^}]*\bcreateStreamableValue\b)[^}]+\};$/m;
      const match = chunk.code.match(valueExport);

      if (match == null) {
        this.error('RSC value exports were not found in dist/index.d.ts');
      }

      // `export type *` is intentional in the build-only source entry, but
      // The previous declaration build flattened it into value declarations.
      // Preserve that public API.
      chunk.code = chunk.code.replace(
        valueExport,
        match[0].replace('export type', 'export'),
      );
    },
  };
}

export default defineConfig([
  // RSC APIs - shared client
  {
    // Kept as a separate external chunk so server and client bundles share a single module instance at runtime.
    entry: ['src/rsc-shared.ts'],
    outDir: 'dist',
    format: ['esm'],
    banner: {
      js: "'use client';",
    },
    deps: {
      neverBundle: ['react', 'zod'],
    },
    dts: {
      sourcemap: false,
    },
    sourcemap: true,
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    outputOptions: {
      plugins: [removeDanglingDeclarationSourcemapComments()],
    },
    clean: false,
    fixedExtension: false,
  },
  // RSC APIs - server, client
  {
    entry: ['src/rsc-server.ts', 'src/rsc-client.ts'],
    outDir: 'dist',
    format: ['esm'],
    deps: {
      neverBundle: ['react', 'zod', /\/rsc-shared/],
    },
    dts: {
      sourcemap: false,
    },
    sourcemap: true,
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    outputOptions: {
      plugins: [
        removeDanglingDeclarationSourcemapComments(),
        preserveRscClientSourcemap(),
      ],
    },
    clean: false,
    fixedExtension: false,
  },
  // RSC APIs - types
  {
    entry: ['src/types/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    dts: {
      sourcemap: false,
    },
    sourcemap: false,
    tsconfig: 'tsconfig.build.json',
    target: 'es2018',
    platform: 'node',
    outputOptions: {
      plugins: [
        removeDanglingDeclarationSourcemapComments(),
        preserveRscValueExports(),
      ],
    },
    clean: false,
    fixedExtension: false,
  },
]);
