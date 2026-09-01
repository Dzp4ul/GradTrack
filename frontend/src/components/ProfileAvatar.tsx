import { useEffect, useState } from 'react';

interface ProfileAvatarProps {
  src?: string | null;
  label?: string | null;
  imageClassName: string;
  fallbackClassName: string;
  resolveUrl?: (path?: string | null) => string;
}

export function getProfileInitials(value?: string | null) {
  const text = (value || '').trim();
  if (!text) return 'G';

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

/**
 * Shared profile-image renderer for authenticated and public graduate data.
 * The caller owns identity selection; this component only resolves the given
 * person's image and falls back to that same person's initials.
 */
export default function ProfileAvatar({
  src,
  label,
  imageClassName,
  fallbackClassName,
  resolveUrl = (path) => path || '',
}: ProfileAvatarProps) {
  const resolvedSrc = src ? resolveUrl(src) : '';
  const [loadState, setLoadState] = useState({ source: '', retryCount: 0, failed: false });
  useEffect(() => {
    setLoadState({ source: resolvedSrc, retryCount: 0, failed: false });
  }, [resolvedSrc]);

  const currentState = loadState.source === resolvedSrc
    ? loadState
    : { source: resolvedSrc, retryCount: 0, failed: false };
  const canRefreshAuthenticatedMedia = /\/api\/media\.php\?/i.test(resolvedSrc);
  const imageSrc = currentState.retryCount > 0
    ? `${resolvedSrc}${resolvedSrc.includes('?') ? '&' : '?'}gradtrack_avatar_retry=${currentState.retryCount}`
    : resolvedSrc;

  if (imageSrc && !currentState.failed) {
    return (
      <img
        src={imageSrc}
        alt={label || 'Profile'}
        className={imageClassName}
        onError={() => {
          if (currentState.retryCount === 0 && canRefreshAuthenticatedMedia) {
            setLoadState({ source: resolvedSrc, retryCount: 1, failed: false });
            return;
          }
          setLoadState({ source: resolvedSrc, retryCount: currentState.retryCount, failed: true });
        }}
      />
    );
  }

  return (
    <div className={fallbackClassName} aria-label={label || 'Profile'}>
      {getProfileInitials(label)}
    </div>
  );
}
