'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage first, then system preference
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
    const shouldBeDark = stored === 'dark' || (!stored && prefersDark);

    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
  }, []);

  const toggleDarkMode = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.documentElement.classList.toggle('dark', newIsDark);
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
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
