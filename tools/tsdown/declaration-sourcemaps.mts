import path from 'node:path';

type GeneratedFile =
  | { type: 'chunk'; fileName: string; code: string }
  | { type: 'asset'; fileName: string };

type GeneratedBundle = Record<string, GeneratedFile>;

const declarationFilePattern = /\.d\.(?:ts|cts|mts)$/;
const sourceMapCommentPattern =
  /(^|\r?\n)\/\/# sourceMappingURL=([^\r\n]+)(\r?\n)?$/;

export function removeDanglingDeclarationSourcemapComments() {
  return {
    name: 'ai-sdk-remove-dangling-declaration-sourcemap-comments',
    generateBundle(_outputOptions: unknown, bundle: GeneratedBundle) {
      const emittedFiles = new Set(Object.keys(bundle).map(toPosixPath));

      for (const output of Object.values(bundle)) {
        if (
          output.type !== 'chunk' ||
          !declarationFilePattern.test(output.fileName)
        ) {
          continue;
        }

        const match = sourceMapCommentPattern.exec(output.code);

        if (match == null) {
          continue;
        }

        const normalizedOutput = toPosixPath(output.fileName);
        const expectedMap = `${normalizedOutput}.map`;
        const referencedMap = path.posix.normalize(
          path.posix.join(
            path.posix.dirname(normalizedOutput),
            match[2].trim(),
          ),
        );

        if (referencedMap === expectedMap && !emittedFiles.has(expectedMap)) {
          output.code =
            output.code.slice(0, match.index) + (match[3] ?? match[1]);
        }
      }
    },
  };
}

function toPosixPath(fileName: string) {
  return fileName.replaceAll('\\', '/');
}
