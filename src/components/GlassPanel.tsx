import type { HTMLAttributes } from 'react';
export function GlassPanel({
  className = '',
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={`glass-panel ${className}`} {...props} />;
}
