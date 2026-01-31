'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        aria-label="Toggle theme"
        className="size-9"
        size="sm"
        variant="ghost"
      >
        <Sun className="size-4" />
      </Button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <Button
      aria-label="Toggle theme"
      className="size-9"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      size="sm"
      variant="ghost"
    >
      {isDark ? (
        <Moon className="size-4" />
      ) : (
        <Sun className="size-4" />
      )}
    </Button>
  );
}
