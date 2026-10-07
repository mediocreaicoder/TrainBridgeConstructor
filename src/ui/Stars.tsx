import { MAX_STARS } from '../game/train';

interface StarsProps {
  /** How many of the MAX_STARS are earned (filled). */
  count: number;
}

/**
 * Stars as a row of small pixel squares: filled yellow for each one earned,
 * dark for the rest. (The pixel font has no star glyph.)
 */
export function Stars({ count }: StarsProps) {
  return (
    <span className="stars" role="img" aria-label={`${count} of ${MAX_STARS} stars`}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span key={i} className={i < count ? 'star star-on' : 'star'} />
      ))}
    </span>
  );
}
