import type { TemplateBackend, TemplateKey } from './template.config';

export const SCENARIO_KEYS = [
  'next',
  'next-auth',
  'vite',
  'vite-auth',
  'convex-next-auth-bootstrap',
  'convex-vite-auth-bootstrap',
  'create-convex-bare',
  'create-convex-nextjs-shadcn',
  'create-convex-react-vite-shadcn',
] as const;

export const FULL_CONVEX_SCENARIO_KEYS = [
  'convex-next-auth-bootstrap',
  'convex-vite-auth-bootstrap',
] as const;

export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

type ScenarioSource =
  | {
      kind: 'fixture';
      fixture: string;
    }
  | {
      kind: 'fresh';
      template: 'next' | 'vite';
    }
  | {
      kind: 'template';
      template: TemplateKey;
    };

type ScenarioStep = readonly string[];

export type ScenarioDefinition = {
  backend?: TemplateBackend;
  check: boolean;
  env?: Record<string, string>;
  label: string;
  setup: readonly ScenarioStep[];
  source: ScenarioSource;
  validation: {
    beforeCheck?: readonly ScenarioStep[];
    lint: boolean;
  };
};

export const SCENARIO_DEFINITIONS: Record<ScenarioKey, ScenarioDefinition> = {
  next: {
    check: false,
    label: 'next',
    setup: [],
    validation: {
      lint: true,
    },
    source: {
      kind: 'template',
      template: 'next',
    },
  },
  'next-auth': {
    check: false,
    label: 'next + auth',
    setup: [],
    validation: {
      lint: true,
    },
    source: {
      kind: 'template',
      template: 'next-auth',
    },
  },
  vite: {
    check: false,
    label: 'vite',
    setup: [],
    validation: {
      lint: false,
    },
    source: {
      kind: 'template',
      template: 'vite',
    },
  },
  'vite-auth': {
    check: false,
    label: 'vite + auth',
    setup: [],
    validation: {
      lint: false,
    },
    source: {
      kind: 'template',
      template: 'vite-auth',
    },
  },
  'convex-next-auth-bootstrap': {
    backend: 'convex',
    check: true,
    env: {
      CONVEX_AGENT_MODE: 'anonymous',
    },
    label: 'convex next auth bootstrap',
    setup: [['add', 'auth', '--yes', '--no-codegen']],
    validation: {
      beforeCheck: [
        ['convex', 'init'],
        ['better-convex', 'dev', '--once', '--typecheck', 'disable'],
        ['better-convex', 'env', 'push', '--auth'],
      ],
      lint: true,
    },
    source: {
      kind: 'fresh',
      template: 'next',
    },
  },
  'convex-vite-auth-bootstrap': {
    backend: 'convex',
    check: true,
    env: {
      CONVEX_AGENT_MODE: 'anonymous',
    },
    label: 'convex vite auth bootstrap',
    setup: [['add', 'auth', '--yes', '--no-codegen']],
    validation: {
      beforeCheck: [
        ['convex', 'init'],
        ['better-convex', 'dev', '--once', '--typecheck', 'disable'],
        ['better-convex', 'env', 'push', '--auth'],
      ],
      lint: false,
    },
    source: {
      kind: 'fresh',
      template: 'vite',
    },
  },
  'create-convex-bare': {
    check: true,
    label: 'create-convex bare adoption',
    setup: [['init', '--yes']],
    validation: {
      lint: false,
    },
    source: {
      kind: 'fixture',
      fixture: 'create-convex-bare',
    },
  },
  'create-convex-nextjs-shadcn': {
    check: true,
    label: 'create-convex nextjs-shadcn adoption',
    setup: [['init', '--yes']],
    validation: {
      lint: false,
    },
    source: {
      kind: 'fixture',
      fixture: 'create-convex-nextjs-shadcn',
    },
  },
  'create-convex-react-vite-shadcn': {
    check: true,
    label: 'create-convex react-vite-shadcn adoption',
    setup: [['init', '--yes']],
    validation: {
      lint: false,
    },
    source: {
      kind: 'fixture',
      fixture: 'create-convex-react-vite-shadcn',
    },
  },
};
