import { PROJECT_CRPC_IMPORT_PLACEHOLDER } from '../../scaffold-placeholders.js';

export const INIT_HTTP_IMPORT_MARKER = '// __KITCN_HTTP_IMPORTS__';
export const INIT_HTTP_ROUTE_MARKER = '  // __KITCN_HTTP_ROUTES__';

export const INIT_HTTP_TEMPLATE = `import { createHttpRouter } from 'kitcn/server';
import { Hono } from 'hono';
import { router } from '${PROJECT_CRPC_IMPORT_PLACEHOLDER}';
${INIT_HTTP_IMPORT_MARKER}

const app = new Hono();

export const httpRouter = router({
${INIT_HTTP_ROUTE_MARKER}
});

export default createHttpRouter(app, httpRouter);
`;
