export type TemplateBackend = 'convex' | 'concave';

export const TEMPLATE_KEYS = [
  'next',
  'next-auth',
  'vite',
  'vite-auth',
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type TemplateDefinition = {
  initTemplate: 'next' | 'vite';
  label: string;
  setup: ReadonlyArray<readonly string[]>;
  successMessage: string;
  validation: {
    lint: boolean;
  };
};

export const TEMPLATE_DEFINITIONS: Record<TemplateKey, TemplateDefinition> = {
  next: {
    initTemplate: 'next',
    label: 'next',
    setup: [],
    successMessage: 'fixtures/next matches fresh `kitcn init -t next` output.',
    validation: {
      lint: true,
    },
  },
  'next-auth': {
    initTemplate: 'next',
    label: 'next + auth',
    setup: [['add', 'auth', '--yes']],
    successMessage:
      'fixtures/next-auth matches fresh `kitcn init -t next && kitcn add auth` output.',
    validation: {
      lint: true,
    },
  },
  vite: {
    initTemplate: 'vite',
    label: 'vite',
    setup: [],
    successMessage: 'fixtures/vite matches fresh `kitcn init -t vite` output.',
    validation: {
      lint: false,
    },
  },
  'vite-auth': {
    initTemplate: 'vite',
    label: 'vite + auth',
    setup: [['add', 'auth', '--yes']],
    successMessage:
      'fixtures/vite-auth matches fresh `kitcn init -t vite && kitcn add auth` output.',
    validation: {
      lint: false,
    },
  },
};
