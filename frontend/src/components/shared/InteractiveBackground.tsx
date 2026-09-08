import { useEffect, useRef, useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';

export function InteractiveBackground() {
  const { theme } = useTheme();
  const bgRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50, pxX: 0, pxY: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const xPercent = (e.clientX / window.innerWidth) * 100;
        const yPercent = (e.clientY / window.innerHeight) * 100;
        setMousePos({
          x: Math.round(xPercent * 10) / 10,
          y: Math.round(yPercent * 10) / 10,
          pxX: e.clientX,
          pxY: e.clientY,
        });

        if (bgRef.current) {
          bgRef.current.style.setProperty('--mouse-x', `${xPercent}%`);
          bgRef.current.style.setProperty('--mouse-y', `${yPercent}%`);
          bgRef.current.style.setProperty('--mouse-px-x', `${e.clientX}px`);
          bgRef.current.style.setProperty('--mouse-px-y', `${e.clientY}px`);
        }
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={bgRef}
      className={`interactive-ide-bg ${theme === 'light' ? 'theme-light' : 'theme-dark'}`}
      style={{
        '--mouse-x': `${mousePos.x}%`,
        '--mouse-y': `${mousePos.y}%`,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      {/* ─── Layer 1: Ambient Glowing Floating Orbs ────────────────────────── */}
      <div className="ambient-orbs-layer">
        <div className="glow-orb orb-primary" />
        <div className="glow-orb orb-secondary" />
        <div className="glow-orb orb-tertiary" />
        <div className="glow-orb orb-quaternary" />
      </div>

      {/* ─── Layer 2: Subtle Cyber Blueprint Dot Matrix Grid ──────────────── */}
      <div className="cyber-grid-layer" />

      {/* ─── Layer 3: WhatsApp-Style Developer Sticker Doodle Pattern ──────── */}
      <div className="doodle-wallpaper-layer">
        <svg
          className="doodle-pattern-svg"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="dev-doodles-pattern"
              width="500"
              height="500"
              patternUnits="userSpaceOnUse"
            >
              {/* 1. Terminal Window (30, 30) */}
              <g transform="translate(30, 30)">
                <rect x="0" y="0" width="36" height="26" rx="4" className="doodle-stroke doodle-fill" />
                <line x1="0" y1="7" x2="36" y2="7" className="doodle-stroke" />
                <circle cx="5" cy="3.5" r="1.2" className="doodle-stroke" />
                <circle cx="9" cy="3.5" r="1.2" className="doodle-stroke" />
                <path d="M5 14 L9 17 L5 20" className="doodle-stroke" />
                <line x1="12" y1="20" x2="18" y2="20" className="doodle-stroke" />
              </g>

              {/* 2. Curly Braces { } (140, 35) */}
              <g transform="translate(140, 35)">
                <path d="M7 4 C4 4, 3 6, 3 8 L3 11 C3 13, 1 14, 0 14 C1 14, 3 15, 3 17 L3 20 C3 22, 4 24, 7 24" className="doodle-stroke" />
                <path d="M17 4 C20 4, 21 6, 21 8 L21 11 C21 13, 23 14, 24 14 C23 14, 21 15, 21 17 L21 20 C21 22, 20 24, 17 24" className="doodle-stroke" />
              </g>

              {/* 3. Git Branch (245, 25) */}
              <g transform="translate(245, 25)">
                <circle cx="6" cy="6" r="3" className="doodle-stroke" />
                <circle cx="6" cy="22" r="3" className="doodle-stroke" />
                <circle cx="22" cy="10" r="3" className="doodle-stroke" />
                <line x1="6" y1="9" x2="6" y2="19" className="doodle-stroke" />
                <path d="M22 13 C22 18, 6 16, 6 22" className="doodle-stroke" />
              </g>

              {/* 4. Padlock (350, 35) */}
              <g transform="translate(350, 35)">
                <rect x="3" y="10" width="20" height="15" rx="3" className="doodle-stroke" />
                <path d="M7 10 V6 A6 6 0 0 1 19 6 V10" className="doodle-stroke" />
                <circle cx="13" cy="17" r="1.5" className="doodle-stroke" />
                <line x1="13" y1="18.5" x2="13" y2="21" className="doodle-stroke" />
              </g>

              {/* 5. Steaming Coffee Mug (435, 25) */}
              <g transform="translate(435, 25)">
                <path d="M4 9 H20 V18 A5 5 0 0 1 15 23 H9 A5 5 0 0 1 4 18 Z" className="doodle-stroke" />
                <path d="M20 11 H23 A3 3 0 0 1 26 14 V14 A3 3 0 0 1 23 17 H20" className="doodle-stroke" />
                <path d="M8 5 C8 3, 9 3, 9 1" className="doodle-stroke" />
                <path d="M12 6 C12 4, 13 4, 13 2" className="doodle-stroke" />
                <path d="M16 5 C16 3, 17 3, 17 1" className="doodle-stroke" />
              </g>

              {/* 6. Code Tag </> (75, 115) */}
              <g transform="translate(75, 115)">
                <path d="M7 6 L1 13 L7 20" className="doodle-stroke" />
                <path d="M19 6 L25 13 L19 20" className="doodle-stroke" />
                <line x1="15" y1="4" x2="11" y2="22" className="doodle-stroke" />
              </g>

              {/* 7. Microchip CPU (180, 125) */}
              <g transform="translate(180, 125)">
                <rect x="6" y="6" width="18" height="18" rx="3" className="doodle-stroke" />
                <rect x="10" y="10" width="10" height="10" rx="1" className="doodle-stroke" />
                <line x1="10" y1="1" x2="10" y2="6" className="doodle-stroke" />
                <line x1="15" y1="1" x2="15" y2="6" className="doodle-stroke" />
                <line x1="20" y1="1" x2="20" y2="6" className="doodle-stroke" />
                <line x1="10" y1="24" x2="10" y2="29" className="doodle-stroke" />
                <line x1="15" y1="24" x2="15" y2="29" className="doodle-stroke" />
                <line x1="20" y1="24" x2="20" y2="29" className="doodle-stroke" />
                <line x1="1" y1="10" x2="6" y2="10" className="doodle-stroke" />
                <line x1="1" y1="15" x2="6" y2="15" className="doodle-stroke" />
                <line x1="1" y1="20" x2="6" y2="20" className="doodle-stroke" />
                <line x1="24" y1="10" x2="29" y2="10" className="doodle-stroke" />
                <line x1="24" y1="15" x2="29" y2="15" className="doodle-stroke" />
                <line x1="24" y1="20" x2="29" y2="20" className="doodle-stroke" />
              </g>

              {/* 8. Lambda λ (290, 110) */}
              <g transform="translate(290, 110)">
                <path d="M5 22 L14 4" className="doodle-stroke" />
                <path d="M10 13 L21 22" className="doodle-stroke" />
              </g>

              {/* 9. Database (390, 120) */}
              <g transform="translate(390, 120)">
                <ellipse cx="14" cy="5" rx="10" ry="4" className="doodle-stroke" />
                <path d="M4 5 V13 C4 15.2, 8.5 17, 14 17 C19.5 17, 24 15.2, 24 13 V5" className="doodle-stroke" />
                <path d="M4 13 V21 C4 23.2, 8.5 25, 14 25 C19.5 25, 24 23.2, 24 21 V13" className="doodle-stroke" />
              </g>

              {/* 10. Lightning Bolt ⚡ (465, 105) */}
              <g transform="translate(465, 105)">
                <polygon points="14 2, 4 14, 11 14, 9 24, 20 10, 13 10" className="doodle-stroke" />
              </g>

              {/* 11. Security Shield 🛡️ (30, 205) */}
              <g transform="translate(30, 205)">
                <path d="M13 2 L3 6 V13 C3 19, 7.5 24, 13 26 C18.5 24, 23 19, 23 13 V6 Z" className="doodle-stroke" />
                <path d="M9 13 L12 16 L17 10" className="doodle-stroke" />
              </g>

              {/* 12. Bug / Debugger 🐛 (135, 215) */}
              <g transform="translate(135, 215)">
                <ellipse cx="14" cy="14" rx="7" ry="9" className="doodle-stroke" />
                <circle cx="14" cy="5" r="3" className="doodle-stroke" />
                <line x1="12" y1="2" x2="9" y2="0" className="doodle-stroke" />
                <line x1="16" y1="2" x2="19" y2="0" className="doodle-stroke" />
                <line x1="7" y1="11" x2="1" y2="9" className="doodle-stroke" />
                <line x1="21" y1="11" x2="27" y2="9" className="doodle-stroke" />
                <line x1="7" y1="15" x2="0" y2="15" className="doodle-stroke" />
                <line x1="21" y1="15" x2="28" y2="15" className="doodle-stroke" />
                <line x1="7" y1="19" x2="2" y2="22" className="doodle-stroke" />
                <line x1="21" y1="19" x2="26" y2="22" className="doodle-stroke" />
              </g>

              {/* 13. Function Arrow () => (240, 195) */}
              <g transform="translate(240, 195)">
                <path d="M4 6 C2 9, 2 15, 4 18" className="doodle-stroke" />
                <path d="M9 6 C11 9, 11 15, 9 18" className="doodle-stroke" />
                <line x1="15" y1="9" x2="25" y2="9" className="doodle-stroke" />
                <line x1="15" y1="14" x2="25" y2="14" className="doodle-stroke" />
                <path d="M23 6 L29 11.5 L23 17" className="doodle-stroke" />
              </g>

              {/* 14. Cryptographic Key 🔑 (345, 210) */}
              <g transform="translate(345, 210)">
                <circle cx="8" cy="16" r="5" className="doodle-stroke" />
                <line x1="12" y1="12" x2="24" y2="3" className="doodle-stroke" />
                <line x1="19" y1="8" x2="22" y2="11" className="doodle-stroke" />
                <line x1="16" y1="11" x2="18" y2="13" className="doodle-stroke" />
              </g>

              {/* 15. Binary Stream 0101 (435, 195) */}
              <g transform="translate(435, 195)">
                <text x="0" y="16" className="doodle-text" fontFamily="monospace" fontSize="13" fontWeight="bold">
                  0101
                </text>
              </g>

              {/* 16. Rocket Launch 🚀 (85, 300) */}
              <g transform="translate(85, 300)">
                <path d="M14 2 C18 6, 21 12, 21 18 L14 15 L7 18 C7 12, 10 6, 14 2 Z" className="doodle-stroke" />
                <path d="M7 18 L3 22 L7 20" className="doodle-stroke" />
                <path d="M21 18 L25 22 L21 20" className="doodle-stroke" />
                <circle cx="14" cy="10" r="2" className="doodle-stroke" />
                <line x1="14" y1="15" x2="14" y2="23" className="doodle-stroke" strokeDasharray="2 2" />
              </g>

              {/* 17. WiFi / Mesh Broadcast 📡 (190, 290) */}
              <g transform="translate(190, 290)">
                <path d="M4 10 A16 16 0 0 1 24 10" className="doodle-stroke" />
                <path d="M8 14 A10 10 0 0 1 20 14" className="doodle-stroke" />
                <path d="M11 18 A5 5 0 0 1 17 18" className="doodle-stroke" />
                <circle cx="14" cy="22" r="1.5" className="doodle-stroke" />
              </g>

              {/* 18. Square Brackets [ ] (295, 300) */}
              <g transform="translate(295, 300)">
                <path d="M7 4 H2 V22 H7" className="doodle-stroke" />
                <path d="M17 4 H22 V22 H17" className="doodle-stroke" />
              </g>

              {/* 19. Hex Code 0x7F (390, 290) */}
              <g transform="translate(390, 290)">
                <text x="0" y="16" className="doodle-text" fontFamily="monospace" fontSize="13" fontWeight="bold">
                  0x7F
                </text>
              </g>

              {/* 20. Cursor Target (465, 295) */}
              <g transform="translate(465, 295)">
                <path d="M3 3 L10 22 L13 14 L21 11 Z" className="doodle-stroke" />
              </g>

              {/* 21. Commit Graph Nodes o--o--o (35, 395) */}
              <g transform="translate(35, 395)">
                <circle cx="4" cy="10" r="3" className="doodle-stroke" />
                <circle cx="16" cy="10" r="3" className="doodle-stroke" />
                <circle cx="28" cy="10" r="3" className="doodle-stroke" />
                <line x1="7" y1="10" x2="13" y2="10" className="doodle-stroke" />
                <line x1="19" y1="10" x2="25" y2="10" className="doodle-stroke" />
              </g>

              {/* 22. Settings Cog ⚙️ (145, 400) */}
              <g transform="translate(145, 400)">
                <circle cx="12" cy="12" r="4" className="doodle-stroke" />
                <path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9" className="doodle-stroke" />
              </g>

              {/* 23. Infinity Loop ∞ (245, 385) */}
              <g transform="translate(245, 385)">
                <path d="M6 13 C2 9, 2 17, 6 13 C10 9, 16 17, 20 13 C24 9, 24 17, 20 13 C16 9, 10 17, 6 13 Z" className="doodle-stroke" />
              </g>

              {/* 24. Folder & File (345, 395) */}
              <g transform="translate(345, 395)">
                <path d="M3 6 V20 A2 2 0 0 0 5 22 H21 A2 2 0 0 0 23 20 V9 A2 2 0 0 0 21 7 H13 L10 4 H5 A2 2 0 0 0 3 6 Z" className="doodle-stroke" />
              </g>

              {/* 25. Div Tag <div /> (430, 390) */}
              <g transform="translate(430, 390)">
                <text x="0" y="16" className="doodle-text" fontFamily="monospace" fontSize="12" fontWeight="bold">
                  &lt;div/&gt;
                </text>
              </g>

              {/* 26. Pull Request Merge ⇄ (90, 465) */}
              <g transform="translate(90, 465)">
                <circle cx="5" cy="5" r="3" className="doodle-stroke" />
                <circle cx="21" cy="17" r="3" className="doodle-stroke" />
                <path d="M5 8 V17 H18" className="doodle-stroke" />
                <path d="M15 14 L18 17 L15 20" className="doodle-stroke" />
              </g>

              {/* 27. E2EE Passphrase Keyhole (205, 460) */}
              <g transform="translate(205, 460)">
                <circle cx="11" cy="7" r="4" className="doodle-stroke" />
                <path d="M8 11 L6 20 H16 L14 11 Z" className="doodle-stroke" />
              </g>

              {/* 28. Monitor / Screen (310, 460) */}
              <g transform="translate(310, 460)">
                <rect x="2" y="2" width="24" height="16" rx="2" className="doodle-stroke" />
                <line x1="14" y1="18" x2="14" y2="23" className="doodle-stroke" />
                <line x1="8" y1="23" x2="20" y2="23" className="doodle-stroke" />
                <line x1="6" y1="7" x2="10" y2="7" className="doodle-stroke" />
              </g>

              {/* 29. Semicolon ; & Hash # (415, 465) */}
              <g transform="translate(415, 465)">
                <text x="0" y="16" className="doodle-text" fontFamily="monospace" fontSize="14" fontWeight="bold">
                  # ;
                </text>
              </g>
            </pattern>
          </defs>

          <rect width="100%" height="100%" fill="url(#dev-doodles-pattern)" />
        </svg>
      </div>

      {/* ─── Layer 4: Interactive Cursor Spotlight ─────────────────────────── */}
      <div className="cursor-spotlight-layer" />

      {/* ─── Layer 5: Vignette Depth Blend ─────────────────────────────────── */}
      <div className="bg-vignette-overlay" />
    </div>
  );
}
