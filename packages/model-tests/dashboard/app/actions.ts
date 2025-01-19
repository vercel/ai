'use server';

import { ModelCapability } from '@/utils/fetchData';
import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { extract } from 'tar';
import JSZip from 'jszip';

async function processJsonFiles(directory: string): Promise<ModelCapability[]> {
  const capabilities: ModelCapability[] = [];

  async function processFile(filePath: string) {
    if (
      filePath.endsWith('.json') &&
      !filePath.includes('_metadata.json') &&
      !filePath.includes('.DS_Store')
    ) {
      const content = await readFile(filePath, 'utf-8');
      try {
        const data = JSON.parse(content);
        capabilities.push(data);
      } catch (error) {
        console.error(`Error parsing JSON file ${filePath}:`, error);
      }
    }
  }

  async function walkDir(dir: string) {
    const files = await readdir(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const stats = await stat(filePath);
      if (stats.isDirectory()) {
        await walkDir(filePath);
      } else {
        await processFile(filePath);
      }
    }
  }

  await walkDir(directory);
  return capabilities;
}

export async function uploadArchive(
  formData: FormData,
): Promise<{ capabilities: ModelCapability[] }> {
  const file = formData.get('archive') as File;
  const url = formData.get('url') as string | null;

  if (!file && !url) {
    throw new Error('No file or URL provided');
  }

  // Create a temporary directory for extraction
  const tempDir = join(process.cwd(), 'tmp', Date.now().toString());
  await mkdir(tempDir, { recursive: true });

  try {
    let buffer: Buffer;

    if (url) {
      // Handle URL download
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Failed to download file: ${response.statusText}`);
      buffer = Buffer.from(await response.arrayBuffer());
    } else if (file) {
      // Handle file upload
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      throw new Error('No file or URL provided');
    }

    const fileName = url
      ? url.split('/').pop() || 'downloaded_archive'
      : file.name;
    const filePath = join(tempDir, fileName);
    await writeFile(filePath, buffer);

    if (fileName.endsWith('.zip')) {
      // Handle ZIP files
      const zip = new JSZip();
      const content = await readFile(filePath);
      await zip.loadAsync(content);

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir) {
          const entryPath = join(tempDir, relativePath);
          await mkdir(join(tempDir, relativePath, '..'), { recursive: true });
          const content = await zipEntry.async('nodebuffer');
          await writeFile(entryPath, content);
        }
      }
    } else if (fileName.endsWith('.tar.gz') || fileName.endsWith('.tgz')) {
      // Handle TAR.GZ files
      await extract({
        file: filePath,
        cwd: tempDir,
      });
    } else {
      throw new Error(
        'Unsupported file format. Please upload .zip, .tar.gz, or .tgz files.',
      );
    }

    // Process the extracted files
    const capabilities = await processJsonFiles(tempDir);

    // Clean up: remove the downloaded/uploaded file
    await unlink(filePath);

    return { capabilities };
  } catch (error) {
    console.error('Error processing archive:', error);
    throw error;
  }
}
