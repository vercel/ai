import React, { useState } from 'react';
import { Download, ExternalLink, File, Image } from 'lucide-react';
import { findMediaPreviews, type MediaPreviewData } from '../media';

const anonymousMediaProps = {
  crossOrigin: 'anonymous' as const,
  referrerPolicy: 'no-referrer' as const,
};

export function MediaPreviewList({ data }: { data: unknown }) {
  const previews = findMediaPreviews(data);

  if (previews.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {previews.map((preview, index) => (
        <MediaPreviewCard key={index} preview={preview} />
      ))}
    </div>
  );
}

function MediaPreviewCard({ preview }: { preview: MediaPreviewData }) {
  const [loadRemotePreview, setLoadRemotePreview] = useState(false);
  const canRender =
    preview.source != null &&
    (preview.kind === 'image' ||
      preview.kind === 'audio' ||
      preview.kind === 'video');
  const shouldRender =
    canRender && (preview.sourceType === 'inline' || loadRemotePreview);
  const label = preview.filename ?? `${preview.kind} preview`;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        {preview.kind === 'image' ? (
          <Image className="size-3.5 text-info" aria-hidden="true" />
        ) : (
          <File className="size-3.5 text-info" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {label}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {preview.mediaType}
        </span>
      </div>

      {shouldRender && preview.kind === 'image' && (
        <img
          alt={label}
          className="max-h-72 w-full bg-muted/30 object-contain"
          decoding="async"
          loading="lazy"
          src={preview.source}
          {...anonymousMediaProps}
        />
      )}

      {shouldRender && preview.kind === 'audio' && (
        // Captured media parts do not include caption tracks.
        // oxlint-disable-next-line jsx-a11y/media-has-caption
        <audio
          className="w-full p-2"
          controls
          preload="none"
          src={preview.source}
          {...anonymousMediaProps}
        />
      )}

      {shouldRender && preview.kind === 'video' && (
        // Captured media parts do not include caption tracks.
        // oxlint-disable-next-line jsx-a11y/media-has-caption
        <video
          className="max-h-72 w-full bg-muted/30"
          controls
          preload="metadata"
          src={preview.source}
          {...anonymousMediaProps}
        />
      )}

      <div className="flex items-center gap-2 px-2.5 py-2">
        {canRender && preview.sourceType === 'remote' && !loadRemotePreview && (
          <button
            className="text-xs font-medium text-info hover:underline"
            onClick={() => setLoadRemotePreview(true)}
            type="button"
          >
            Load preview
          </button>
        )}

        {preview.source != null && (
          <a
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            download={
              preview.sourceType === 'inline' ? preview.filename : undefined
            }
            href={preview.source}
            rel="noreferrer"
            target="_blank"
          >
            {preview.sourceType === 'inline' ? (
              <Download className="size-3" aria-hidden="true" />
            ) : (
              <ExternalLink className="size-3" aria-hidden="true" />
            )}
            {preview.sourceType === 'inline' ? 'Download' : 'Open'}
          </a>
        )}

        {preview.source == null && (
          <span className="text-xs text-muted-foreground">
            {preview.unavailableReason ??
              'Preview unavailable; inspect the JSON metadata below.'}
          </span>
        )}
      </div>
    </div>
  );
}
