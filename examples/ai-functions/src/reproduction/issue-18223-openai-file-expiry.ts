import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, uploadFile } from 'ai';

const apiUrl = 'https://api.openai.com/v1';
const expiresAfterSeconds = 604_800;
const filename = 'issue-18223-probe.txt';
const fileBytes = new TextEncoder().encode('hello\n');
const uploadedFileIds = new Set<string>();

type OpenAIFile = {
  id: string;
  expires_at?: number | null;
};

async function openAIRequest(path: string, init?: RequestInit) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...init?.headers,
      },
    });

    if (response.status < 500 || attempt === 3) {
      return response;
    }

    await response.arrayBuffer();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Unreachable OpenAI request retry state.');
}

async function retryTransientAPICall<T>(operation: () => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        !APICallError.isInstance(error) ||
        error.statusCode == null ||
        error.statusCode < 500 ||
        attempt === 3
      ) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unreachable API call retry state.');
}

async function parseFileResponse(response: Response): Promise<OpenAIFile> {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct OpenAI request failed with HTTP ${response.status}: ${body}`,
    );
  }

  return JSON.parse(body) as OpenAIFile;
}

async function deleteUploadedFiles() {
  await Promise.all(
    [...uploadedFileIds].map(async id => {
      const response = await openAIRequest(`/files/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        console.error(
          `Cleanup failed for ${id}: HTTP ${response.status} ${await response.text()}`,
        );
      }
    }),
  );
}

async function main() {
  const directFormData = new FormData();
  directFormData.append(
    'file',
    new Blob([fileBytes], { type: 'text/plain' }),
    filename,
  );
  directFormData.append('purpose', 'user_data');
  directFormData.append('expires_after[anchor]', 'created_at');
  directFormData.append('expires_after[seconds]', String(expiresAfterSeconds));

  const directFile = await parseFileResponse(
    await openAIRequest('/files', {
      method: 'POST',
      body: directFormData,
    }),
  );
  uploadedFileIds.add(directFile.id);

  if (directFile.expires_at == null) {
    throw new Error(
      'OpenAI accepted the documented bracketed fields but did not set expires_at.',
    );
  }

  console.log(
    `Direct OpenAI bracketed upload set expires_at=${directFile.expires_at}.`,
  );

  const openai = createOpenAI();
  const noExpiryResult = await retryTransientAPICall(() =>
    uploadFile({
      api: openai.files(),
      data: fileBytes,
      mediaType: 'text/plain',
      filename,
      providerOptions: {
        openai: { purpose: 'user_data' },
      },
    }),
  );
  const noExpiryId = noExpiryResult.providerReference.openai;
  uploadedFileIds.add(noExpiryId);

  const noExpiryFile = await parseFileResponse(
    await openAIRequest(`/files/${noExpiryId}`),
  );

  if (noExpiryFile.expires_at != null || noExpiryResult.warnings.length !== 0) {
    throw new Error(
      'Control upload unexpectedly had an expiry or emitted a warning.',
    );
  }

  console.log('AI SDK control upload succeeded without expiry and warnings.');

  try {
    const expiringResult = await retryTransientAPICall(() =>
      uploadFile({
        api: openai.files(),
        data: fileBytes,
        mediaType: 'text/plain',
        filename,
        providerOptions: {
          openai: {
            purpose: 'user_data',
            expiresAfter: expiresAfterSeconds,
          },
        },
      }),
    );
    const expiringId = expiringResult.providerReference.openai;
    uploadedFileIds.add(expiringId);

    const expiringFile = await parseFileResponse(
      await openAIRequest(`/files/${expiringId}`),
    );

    if (expiringFile.expires_at == null) {
      throw new Error(
        'AI SDK upload succeeded but OpenAI did not set expires_at.',
      );
    }

    console.log(
      `AI SDK upload with expiresAfter set expires_at=${expiringFile.expires_at}.`,
    );
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      error.statusCode === 400 &&
      error.message.includes(
        "Additional properties are not allowed ('expires_after' was unexpected)",
      )
    ) {
      throw new Error(
        'ISSUE_18223_REPRODUCED: AI SDK expiresAfter upload was rejected because expires_after was unexpected.',
        { cause: error },
      );
    }

    throw error;
  }
}

main()
  .finally(deleteUploadedFiles)
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
