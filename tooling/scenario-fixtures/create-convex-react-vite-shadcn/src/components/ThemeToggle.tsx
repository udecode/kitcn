'use client';

import { DesktopIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons';
import { useTheme } from 'next-themes';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup onValueChange={setTheme} size="sm" type="single" value={theme}>
      <ToggleGroupItem aria-label="Light" value="light">
        <SunIcon />
      </ToggleGroupItem>
      <ToggleGroupItem aria-label="Dark" value="dark">
        <MoonIcon />
      </ToggleGroupItem>
      <ToggleGroupItem aria-label="System" value="system">
        <DesktopIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
