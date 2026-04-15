import type { TemplateBackend, TemplateKey } from './template.config';

export const SCENARIO_KEYS = [
  'next',
  'next-auth',
  'start',
  'start-auth',
  'vite',
  'vite-auth',
  'convex-next-auth-bootstrap',
  'convex-vite-auth-bootstrap',
  'convex-next-all',
  'create-convex-nextjs-shadcn-auth',
  'raw-start-auth-adoption',
  'create-convex-bare',
  'create-convex-nextjs-shadcn',
  'create-convex-react-vite-shadcn',
] as const;

export const DEFAULT_CHECK_SCENARIO_KEYS = [
  'convex-next-auth-bootstrap',
  'convex-vite-auth-bootstrap',
  'create-convex-bare',
  'create-convex-nextjs-shadcn',
  'create-convex-react-vite-shadcn',
] as const;

export const FULL_CONVEX_SCENARIO_KEYS = [
  'convex-next-auth-bootstrap',
  'convex-vite-auth-bootstrap',
  'convex-next-all',
  'create-convex-nextjs-shadcn-auth',
  'raw-start-auth-adoption',
] as const;

export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

type ScenarioSource =
  | {
      kind: 'fixture';
      fixture: string;
    }
  | {
      kind: 'fresh';
      template: 'next' | 'start' | 'vite';
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
    authSchemaStress?: boolean;
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
  start: {
    check: false,
    label: 'start',
    setup: [],
    validation: {
      lint: true,
    },
    source: {
      kind: 'template',
      template: 'start',
    },
  },
  'start-auth': {
    check: false,
    label: 'start + auth',
    setup: [],
    validation: {
      lint: true,
    },
    source: {
      kind: 'template',
      template: 'start-auth',
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
    label: 'convex next auth bootstrap',
    setup: [['add', 'auth', '--yes', '--no-codegen']],
    validation: {
      authSchemaStress: true,
      beforeCheck: [['init', '--yes', '--json']],
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
    label: 'convex vite auth bootstrap',
    setup: [['add', 'auth', '--yes', '--no-codegen']],
    validation: {
      beforeCheck: [['init', '--yes', '--json']],
      lint: false,
    },
    source: {
      kind: 'fresh',
      template: 'vite',
    },
  },
  'convex-next-all': {
    backend: 'convex',
    check: true,
    label: 'convex next all',
    setup: [
      ['add', 'ratelimit', '--yes', '--no-codegen'],
      ['add', 'auth', '--yes', '--no-codegen'],
      ['add', 'resend', '--yes', '--no-codegen'],
    ],
    validation: {
      authSchemaStress: true,
      beforeCheck: [['init', '--yes', '--json']],
      lint: true,
    },
    source: {
      kind: 'fresh',
      template: 'next',
    },
  },
  'create-convex-nextjs-shadcn-auth': {
    backend: 'convex',
    check: false,
    label: 'create-convex nextjs-shadcn auth adoption',
    setup: [],
    validation: {
      beforeCheck: [
        ['convex', 'init'],
        ['kitcn', 'add', 'auth', '--preset', 'convex', '--yes'],
      ],
      lint: false,
    },
    source: {
      kind: 'fixture',
      fixture: 'create-convex-nextjs-shadcn',
    },
  },
  'raw-start-auth-adoption': {
    backend: 'convex',
    check: false,
    label: 'raw start auth adoption',
    setup: [],
    validation: {
      beforeCheck: [
        ['convex', 'init'],
        ['kitcn', 'add', 'auth', '--preset', 'convex', '--yes'],
      ],
      lint: false,
    },
    source: {
      kind: 'fixture',
      fixture: 'raw-start-auth-adoption',
    },
  },
  'create-convex-bare': {
    check: true,
    label: 'create-convex bare runtime',
    setup: [],
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
    setup: [['init', '--yes', '--json']],
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
    setup: [['init', '--yes', '--json']],
    validation: {
      lint: false,
    },
    source: {
      kind: 'fixture',
      fixture: 'create-convex-react-vite-shadcn',
    },
  },
};
