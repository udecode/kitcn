import { FUNCTIONS_DIR_IMPORT_PLACEHOLDER } from '../../plugin-catalog.js';

export const INIT_CRPC_IMPORT_MARKER = '// __BETTER_CONVEX_CRPC_IMPORTS__';

export const INIT_CRPC_TEMPLATE = `import { initCRPC } from '${FUNCTIONS_DIR_IMPORT_PLACEHOLDER}/generated/server';
${INIT_CRPC_IMPORT_MARKER}

const c = initCRPC
  .meta<{
    auth?: 'optional' | 'required';
    role?: 'admin';
    ratelimit?: string;
  }>()
  .create();

export const publicQuery = c.query;
export const publicAction = c.action;
export const publicMutation = c.mutation;

export const privateQuery = c.query.internal();
export const privateMutation = c.mutation.internal();
export const privateAction = c.action.internal();

export const publicRoute = c.httpAction;
export const router = c.router;
`;
