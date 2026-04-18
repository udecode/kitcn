export type TemplateBackend = 'convex' | 'concave';

export const TEMPLATE_KEYS = [
  'expo',
  'expo-auth',
  'next',
  'next-auth',
  'start',
  'start-auth',
  'vite',
  'vite-auth',
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type TemplateDefinition = {
  initTemplate: 'next' | 'expo' | 'start' | 'vite';
  label: string;
  setup: ReadonlyArray<readonly string[]>;
  successMessage: string;
  validation: {
    lint: boolean;
  };
};

export const TEMPLATE_DEFINITIONS: Record<TemplateKey, TemplateDefinition> = {
  expo: {
    initTemplate: 'expo',
    label: 'expo',
    setup: [],
    successMessage: 'fixtures/expo matches fresh `kitcn init -t expo` output.',
    validation: {
      lint: false,
    },
  },
  'expo-auth': {
    initTemplate: 'expo',
    label: 'expo + auth',
    setup: [['add', 'auth', '--yes']],
    successMessage:
      'fixtures/expo-auth matches fresh `kitcn init -t expo && kitcn add auth` output.',
    validation: {
      lint: false,
    },
  },
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
  start: {
    initTemplate: 'start',
    label: 'start',
    setup: [],
    successMessage:
      'fixtures/start matches fresh `kitcn init -t start` output.',
    validation: {
      lint: false,
    },
  },
  'start-auth': {
    initTemplate: 'start',
    label: 'start + auth',
    setup: [['add', 'auth', '--yes']],
    successMessage:
      'fixtures/start-auth matches fresh `kitcn init -t start && kitcn add auth` output.',
    validation: {
      lint: false,
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
