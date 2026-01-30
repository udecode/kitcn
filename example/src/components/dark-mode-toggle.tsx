'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

type Theme = 'light' | 'dark';
const THEME_KEY = 'theme' as const;

function isValidTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

const safeLocalStorage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('localStorage unavailable:', error);
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  },
};

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);
  const mounted = useMounted();

  useEffect(() => {
    // Check localStorage first, then system preference
    const stored = safeLocalStorage.get(THEME_KEY);
    const storedTheme = isValidTheme(stored) ? stored : null;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const shouldBeDark = storedTheme === 'dark' || (!storedTheme && mediaQuery.matches);

    setIsDark(shouldBeDark);

    // Listen for system preference changes
    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if no explicit preference stored
      if (!safeLocalStorage.get(THEME_KEY)) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Synchronize DOM with React state
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    safeLocalStorage.set(THEME_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleDarkMode = () => {
    setIsDark(!isDark);
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <Button
        aria-label="Toggle dark mode"
        className="gap-2"
        size="sm"
        variant="ghost"
      >
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      aria-label="Toggle dark mode"
      className="gap-2"
      onClick={toggleDarkMode}
      size="sm"
      variant="ghost"
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      <span className="hidden sm:inline">{isDark ? 'Dark' : 'Light'}</span>
    </Button>
  );
}
