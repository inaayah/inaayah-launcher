import { useState, type ReactNode } from 'react';
import { Gamepad2 } from 'lucide-react';
import { getAssetUrl } from '../utils/assets';

interface GameTileArtworkProps {
  banner?: string;
  cover?: string;
  children?: ReactNode;
}

function ArtworkLayers({ sources }: { sources: string[] }) {
  const [index, setIndex] = useState(0);
  const source = sources[index];

  if (!source) {
    return <div className="card-banner-placeholder" aria-hidden="true"><Gamepad2 size={24} /></div>;
  }

  return (
    <>
      <img className="card-banner-backdrop" src={source} alt="" loading="lazy" decoding="async" />
      <img
        key={source}
        className="card-banner-image"
        src={source}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setIndex(index + 1)}
      />
    </>
  );
}

export function GameTileArtwork({ banner, cover, children }: GameTileArtworkProps) {
  const sources = [...new Set([getAssetUrl(banner), getAssetUrl(cover)].filter(Boolean))];

  return (
    <div className="card-banner">
      <ArtworkLayers key={JSON.stringify(sources)} sources={sources} />
      {children}
    </div>
  );
}
