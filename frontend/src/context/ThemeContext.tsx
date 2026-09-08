import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'nulltor_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) as Theme | null;
    if (saved === 'dark' || saved === 'light') return saved;
    return 'dark'; // default to enterprise dark mode
  });

  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyThemeWithTransition = (newTheme: Theme) => {
    if (!document.documentElement) return;

    const commitTheme = () => {
      document.documentElement.classList.add('theme-transitioning');
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem(LOCAL_STORAGE_KEY, newTheme);
      setThemeState(newTheme);

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }

      transitionTimerRef.current = setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 500);
    };

    if ('startViewTransition' in document && typeof (document as any).startViewTransition === 'function') {
      try {
        (document as any).startViewTransition(() => {
          commitTheme();
        });
        return;
      } catch {
        // Fall back to standard CSS class transition
      }
    }

    commitTheme();
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  const toggleTheme = () => {
    applyThemeWithTransition(theme === 'dark' ? 'light' : 'dark');
  };

  const setTheme = (t: Theme) => {
    applyThemeWithTransition(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
