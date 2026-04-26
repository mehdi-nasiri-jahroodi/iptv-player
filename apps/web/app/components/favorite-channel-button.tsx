import { Heart } from 'lucide-react';
import { Button } from 'ui';
import { favoriteKey, useProfileStore } from '../store/profile-store';

export function ChannelFavoriteButton({
  sourceId,
  channelId,
  focusKey,
}: {
  sourceId: string;
  channelId: string;
  focusKey: string;
}) {
  const key = favoriteKey(sourceId, channelId);
  const isFavorite = useProfileStore((s) => s.profile.favorites.includes(key));
  const toggleFavorite = useProfileStore((s) => s.toggleFavorite);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      focusKey={focusKey}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      className="h-11 w-11 shrink-0 p-0 text-foreground-muted hover:text-danger"
      onClick={() => toggleFavorite(key)}
    >
      <Heart
        size={24}
        strokeWidth={isFavorite ? 2 : 1.75}
        className={isFavorite ? 'fill-danger text-danger' : undefined}
        aria-hidden
      />
    </Button>
  );
}
