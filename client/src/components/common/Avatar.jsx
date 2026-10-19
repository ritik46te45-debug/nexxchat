import { useState, useEffect } from 'react';
import { resolveMediaUrl } from '../../lib/api';

export default function Avatar({
  src,
  alt = '',
  name = 'User',
  size = 'md',
  className = '',
  textClassName = '',
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const initial = (name || '?').trim().charAt(0).toUpperCase() || 'U';
  const resolvedUrl = src ? resolveMediaUrl(src) : '';

  if (resolvedUrl && !hasError) {
    return (
      <img
        src={resolvedUrl}
        alt={alt || name}
        onError={() => setHasError(true)}
        className={`${sizeClasses[size] || sizeClasses.md} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size] || sizeClasses.md} rounded-full gradient-primary text-white font-bold flex items-center justify-center flex-shrink-0 select-none shadow-sm ${className}`}
    >
      <span className={textClassName}>{initial}</span>
    </div>
  );
}
