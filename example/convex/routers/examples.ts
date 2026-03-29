import { CRPCError } from 'kitcn/server';
import { z } from 'zod';
import { authRoute, publicRoute, router } from '../lib/crpc';

/** POST /webhooks/example - Webhook with signature verification */
export const webhook = publicRoute
  .post('/webhooks/example')
  .mutation(async ({ c }) => {
    const signature = c.req.header('x-webhook-signature');
    if (!signature) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: 'Missing signature',
      });
    }
    const _body = await c.req.text();
    return c.text('OK', 200);
  });

/** GET /api/old-path - Redirect example */
export const redirectExample = publicRoute
  .get('/api/old-path')
  .query(async ({ c }) => c.redirect('/api/health', 301));

/** GET /api/examples/search - searchParams only */
export const searchExample = publicRoute
  .get('/api/examples/search')
  .searchParams(
    z.object({
      q: z.string(),
      page: z.number().optional(),
      tags: z.array(z.string()).optional(),
    })
  )
  .output(
    z.object({ q: z.string(), page: z.number(), tags: z.array(z.string()) })
  )
  .query(async ({ searchParams }) => ({
    q: searchParams.q,
    page: searchParams.page ?? 1,
    tags: searchParams.tags ?? [],
  }));

/** GET /api/examples/items/:id - params only */
export const paramsExample = publicRoute
  .get('/api/examples/items/:id')
  .params(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .query(async ({ params }) => ({ id: params.id }));

/** POST /api/examples/items - input only (JSON body) */
export const inputExample = publicRoute
  .post('/api/examples/items')
  .input(
    z.object({
      name: z.string(),
      count: z.number(),
      metadata: z.record(z.string(), z.string()).optional(),
    })
  )
  .output(z.object({ name: z.string(), count: z.number() }))
  .mutation(async ({ input }) => ({
    name: input.name,
    count: input.count,
  }));

/** PATCH /api/examples/items/:id - params + input combined */
export const paramsInputExample = publicRoute
  .patch('/api/examples/items/:id')
  .params(z.object({ id: z.string() }))
  .input(
    z.object({ name: z.string().optional(), active: z.boolean().optional() })
  )
  .output(z.object({ id: z.string(), updated: z.boolean() }))
  .mutation(async ({ params, input }) => ({
    id: params.id,
    updated: !!input.name || input.active !== undefined,
  }));

/** GET /api/examples/items/:id/history - params + searchParams combined */
export const paramsSearchParamsExample = publicRoute
  .get('/api/examples/items/:id/history')
  .params(z.object({ id: z.string() }))
  .searchParams(
    z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
    })
  )
  .output(z.object({ id: z.string(), limit: z.number(), offset: z.number() }))
  .query(async ({ params, searchParams }) => ({
    id: params.id,
    limit: searchParams.limit ?? 10,
    offset: searchParams.offset ?? 0,
  }));

/** POST /api/examples/items/:id/tags - params + searchParams + input all combined */
export const allCombinedExample = authRoute
  .post('/api/examples/items/:id/tags')
  .params(z.object({ id: z.string() }))
  .searchParams(z.object({ notify: z.boolean().optional() }))
  .input(z.object({ tags: z.array(z.string()) }))
  .output(
    z.object({
      id: z.string(),
      tags: z.array(z.string()),
      notified: z.boolean(),
    })
  )
  .mutation(async ({ params, searchParams, input }) => ({
    id: params.id,
    tags: input.tags,
    notified: searchParams.notify ?? false,
  }));

/** POST /api/examples/upload - FormData file upload (typed via .form()) */
export const uploadExample = authRoute
  .post('/api/examples/upload')
  .form(
    z.object({ file: z.instanceof(Blob), description: z.string().optional() })
  )
  .mutation(async ({ c, form }) => {
    // form.file is typed Blob, form.description is string | undefined
    // Demo: just return file metadata (use R2/S3 for actual storage)
    return c.json({
      filename: form.file instanceof File ? form.file.name : 'unknown',
      size: form.file.size,
      type: form.file.type,
      description: form.description ?? null,
    });
  });

export const examplesRouter = router({
  webhook,
  redirectExample,
  searchExample,
  paramsExample,
  inputExample,
  paramsInputExample,
  paramsSearchParamsExample,
  allCombinedExample,
  uploadExample,
});
