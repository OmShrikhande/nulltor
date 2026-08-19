interface NulltorLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export function NulltorLogo({ size = 'md', showText = true }: NulltorLogoProps) {
  const dimensions = {
    sm: { height: 26 },
    md: { height: 34 },
    lg: { height: 48 },
    xl: { height: 72 },
  }[size];

  return (
    <div className={`nulltor-brand brand-${size}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <div className="logo-symbol-wrapper" style={{ height: dimensions.height, position: 'relative', display: 'flex' }}>
        <img src="/logo-dark.png" alt="Nulltor Logo" className="logo-dark-img" style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
        <img src="/logo-light.png" alt="Nulltor Logo" className="logo-light-img" style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
      </div>
    </div>
  );
}
