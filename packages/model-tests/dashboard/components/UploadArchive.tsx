'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Link } from 'lucide-react';
import { uploadArchive } from '@/app/actions';
import { ModelCapability } from '@/utils/fetchData';
import { useToast } from '@/components/ui/use-toast';

interface UploadArchiveProps {
  onUpload: (capabilities: ModelCapability[]) => void;
}

export default function UploadArchive({ onUpload }: UploadArchiveProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  async function handleSubmit(formData: FormData) {
    try {
      setIsUploading(true);
      const result = await uploadArchive(formData);
      onUpload(result.capabilities);
      formRef.current?.reset();
      setUrl('');
      toast({
        title: 'Upload successful',
        description: `Loaded ${result.capabilities.length} model capabilities.`,
      });
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: 'Upload failed',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="flex items-center gap-2"
    >
      <input
        ref={fileInputRef}
        type="file"
        name="archive"
        accept=".zip,.tar.gz,.tgz"
        className="hidden"
        onChange={e => {
          if (e.target.files?.[0]) {
            formRef.current?.requestSubmit();
          }
        }}
      />
      <Input
        type="url"
        name="url"
        placeholder="Paste archive URL"
        value={url}
        onChange={e => setUrl(e.target.value)}
        className="max-w-xs"
      />
      <Button
        type="submit"
        variant="outline"
        className="bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100"
        disabled={isUploading}
      >
        <Link className="mr-2 h-4 w-4" />
        {isUploading ? 'Uploading...' : 'Upload from URL'}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mr-2 h-4 w-4" />
        {isUploading ? 'Uploading...' : 'Upload File'}
      </Button>
    </form>
  );
}
