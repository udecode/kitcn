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
    successMessage:
      'templates/next matches fresh `better-convex create -t next` output.',
    validation: {
      lint: true,
    },
  },
  'next-auth': {
    initTemplate: 'next',
    label: 'next + auth',
    setup: [['add', 'auth', '--yes']],
    successMessage:
      'templates/next-auth matches fresh `better-convex create -t next && better-convex add auth` output.',
    validation: {
      lint: true,
    },
  },
  vite: {
    initTemplate: 'vite',
    label: 'vite',
    setup: [],
    successMessage:
      'templates/vite matches fresh `better-convex create -t vite` output.',
    validation: {
      lint: false,
    },
  },
  'vite-auth': {
    initTemplate: 'vite',
    label: 'vite + auth',
    setup: [['add', 'auth', '--yes']],
    successMessage:
      'templates/vite-auth matches fresh `better-convex create -t vite && better-convex add auth` output.',
    validation: {
      lint: false,
    },
  },
};
