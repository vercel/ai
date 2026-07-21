import { fal } from '@ai-sdk/fal';
import { experimental_generateArtifact as generateArtifact } from 'ai';
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';

async function main() {
  const { artifact, artifacts } = await generateArtifact({
    model: fal.artifact('tripo3d/h3.1/text-to-3d'),
    prompt: 'A low-poly red fox standing on a stone plinth',
    providerOptions: {
      fal: {
        texture: true,
        pbr: true,
        geometryQuality: 'standard',
      },
    },
  });

  // Provider filenames are untrusted metadata, so use a controlled local path.
  const filename = 'artifact.glb';
  await writeFile(filename, artifact.uint8Array);
  console.log(`Wrote ${filename} (${artifact.mediaType})`);
  console.log(`Received ${artifacts.length} artifact(s)`);
}

main().catch(console.error);
