import { initCRPC } from '../functions/generated/server';

const c = initCRPC.create();

export const publicQuery = c.query;
export const publicMutation = c.mutation;
