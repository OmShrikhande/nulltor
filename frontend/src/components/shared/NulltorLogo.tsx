interface NulltorLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function NulltorLogo({ size = 'md', showText = true }: NulltorLogoProps) {
  const dimensions = {
    sm: { icon: 26, font: '15px' },
    md: { icon: 34, font: '18px' },
    lg: { icon: 48, font: '26px' },
  }[size];

  return (
    <div className={`nulltor-brand brand-${size}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
      <div className="logo-symbol-wrapper" style={{ width: dimensions.icon, height: dimensions.icon, position: 'relative' }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="ntLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--aurora-mint, #01EFAC)" />
              <stop offset="50%" stopColor="var(--aurora-teal, #01CBAE)" />
              <stop offset="100%" stopColor="var(--aurora-purple, #524094)" />
            </linearGradient>
          </defs>

          {/* Circuit Top 'T' Parallel Traces with End Nodes */}
          {/* Top T Bar Line 1 */}
          <line x1="38" y1="24" x2="74" y2="24" stroke="url(#ntLogoGradient)" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="38" cy="24" r="3.5" fill="none" stroke="url(#ntLogoGradient)" strokeWidth="3" />
          <circle cx="74" cy="24" r="3.5" fill="none" stroke="url(#ntLogoGradient)" strokeWidth="3" />

          {/* Top T Bar Line 2 */}
          <line x1="38" y1="34" x2="74" y2="34" stroke="url(#ntLogoGradient)" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="38" cy="34" r="3.5" fill="none" stroke="url(#ntLogoGradient)" strokeWidth="3" />
          <circle cx="74" cy="34" r="3.5" fill="none" stroke="url(#ntLogoGradient)" strokeWidth="3" />

          {/* 'N' Main Circuit Trace */}
          <path
            d="M 18,66 L 18,32 Q 18,28 22,28 L 26,28 L 56,66 Q 60,70 60,64 L 60,24"
            stroke="url(#ntLogoGradient)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 26,66 L 26,38 L 48,66"
            stroke="url(#ntLogoGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Bottom Left Circuit Nodes */}
          <circle cx="18" cy="66" r="3.5" fill="none" stroke="url(#ntLogoGradient)" strokeWidth="3" />
          <circle cx="26" cy="66" r="3.5" fill="none" stroke="url(#ntLogoGradient)" strokeWidth="3" />
        </svg>
      </div>

      {showText && (
        <span
          className="nulltor-logotype"
          style={{
            fontSize: dimensions.font,
            fontWeight: 800,
            letterSpacing: '0.05em',
            fontFamily: 'var(--font-ui)',
            color: '#ffffff',
            textTransform: 'uppercase',
          }}
        >
          NULLTOR
        </span>
      )}
    </div>
  );
}
