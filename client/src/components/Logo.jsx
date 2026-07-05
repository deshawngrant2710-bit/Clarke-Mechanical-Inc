import logoFull from '../assets/logo.png';
import logoMark from '../assets/logo-mark.png';

export default function Logo({ variant = 'full', className = '', height = 48 }) {
  const isIcon = variant === 'icon';
  const src = isIcon ? logoMark : logoFull;
  const alt = isIcon ? 'Clarke Mechanical' : 'Clarke Mechanical Inc.';

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ height, width: isIcon ? height : 'auto' }}
    />
  );
}
