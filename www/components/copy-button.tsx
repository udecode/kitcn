'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

function legacyCopyToClipboard(value: string) {
  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, value.length);

  let hasCopied = false;

  try {
    hasCopied = document.execCommand('copy');
  } catch {
    hasCopied = false;
  }

  document.body.removeChild(textArea);

  return hasCopied;
}

async function copyToClipboard(value: string) {
  if (!value || typeof window === 'undefined') {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return legacyCopyToClipboard(value);
    }
  }

  return legacyCopyToClipboard(value);
}

export function CopyButton({
  value,
  className,
  label = 'Copy code',
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!hasCopied) {
      return;
    }

    const timer = window.setTimeout(() => setHasCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [hasCopied]);

  return (
    <button
      className={cn(
        buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
        'absolute top-2 right-2 z-10 border bg-fd-background/80 text-fd-muted-foreground shadow-sm backdrop-blur-sm hover:text-fd-foreground',
        className
      )}
      data-slot="copy-button"
      onClick={async () => {
        const copied = await copyToClipboard(value);

        if (copied) {
          setHasCopied(true);
        }
      }}
      type="button"
    >
      <span className="sr-only">{label}</span>
      {hasCopied ? <Check /> : <Copy />}
    </button>
  );
}
