import { initCRPC } from '../functions/generated/server';
// __BETTER_CONVEX_CRPC_IMPORTS__

const c = initCRPC.create();

export const publicQuery = c.query;
export const publicAction = c.action;
export const publicMutation = c.mutation;

export const privateQuery = c.query.internal();
export const privateMutation = c.mutation.internal();
export const privateAction = c.action.internal();

export const publicRoute = c.httpAction;
export const router = c.router;
