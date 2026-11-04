'use client';

import {
  ConversationReplay,
  type SimulationMessage,
} from './preview-conversation';

interface Artwork {
  name: string;
  src: string;
}

interface MediaSearchResult {
  images: Artwork[];
}

const messages: SimulationMessage<MediaSearchResult>[] = [
  { role: 'user', content: 'Art made by Van Gogh?' },
  { role: 'tool-call', name: 'searchImages("Van Gogh")' },
  { role: 'assistant', content: 'Here are a few of his notable works' },
  {
    role: 'tool-result',
    name: 'searchImages("Van Gogh")',
    result: {
      images: [
        { name: 'Starry Night', src: '/images/starry-night.jpg' },
        { name: 'Sunflowers', src: '/images/sunflowers.jpg' },
        { name: 'Olive Trees', src: '/images/olive-trees.jpg' },
      ],
    },
  },
  { role: 'user', content: 'Wow, these look great! How about Monet?' },
  { role: 'tool-call', name: 'searchImages("Monet")' },
  { role: 'assistant', content: 'Sure! Here are a few of his paintings' },
  {
    role: 'tool-result',
    name: 'searchImages("Monet")',
    result: {
      images: [
        { name: 'Frau im Gartenfrau', src: '/images/frau-im-gartenfrau.jpg' },
        { name: 'Cliff Walk', src: '/images/cliff-walk.jpg' },
        { name: 'Waves', src: '/images/waves.jpg' },
      ],
    },
  },
];

const Images = ({ images }: { images: Artwork[] }) => {
  const [mainImage, ...thumbnails] = images;

  if (!mainImage) {
    return null;
  }

  return (
    <div className="flex w-full flex-row gap-2">
      <div className="flex flex-1 flex-col">
        {/* Artwork is pre-scaled to 400px, so it skips the Next image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={mainImage.name}
          className="mt-8 h-[115px] w-full rounded-lg bg-gray-300 object-cover"
          height={115}
          loading="lazy"
          src={mainImage.src}
          width={150}
        />
        <div className="text-gray-900 text-sm">{mainImage.name}</div>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {thumbnails.slice(0, 2).map(image => (
          <div className="flex flex-col gap-2" key={image.src}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={image.name}
              className="h-[75px] w-full rounded-lg bg-gray-300 object-cover"
              height={75}
              loading="lazy"
              src={image.src}
              width={150}
            />
            <div className="text-gray-900 text-xs">{image.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Simulated media search: the model calls `searchImages` and renders artwork
 * thumbnails inline (ported from the legacy ai-sdk.dev app; artwork served
 * from this app's `/images`).
 */
export const MediaSearchSimulation = ({
  isPlaying = false,
}: {
  isPlaying?: boolean;
}) => (
  <ConversationReplay
    alignEnd
    height={410}
    holdDelay={2000}
    isPlaying={isPlaying}
    messages={messages}
    renderResult={({ result }) => <Images images={result.images} />}
  />
);
