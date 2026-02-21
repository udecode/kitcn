type ApiErrorLike = {
  body?: unknown;
  headers?: HeadersInit;
  name?: string;
  status?: number | string;
  statusCode?: number;
};

const isApiErrorLike = (error: unknown): error is ApiErrorLike =>
  !!error &&
  typeof error === 'object' &&
  (((error as { name?: unknown }).name === 'APIError' &&
    'statusCode' in error) ||
    typeof (error as { statusCode?: unknown }).statusCode === 'number');

const toResponseInit = (error: ApiErrorLike): ResponseInit => {
  const init: ResponseInit = {
    headers: new Headers(error.headers ?? {}),
    status: typeof error.statusCode === 'number' ? error.statusCode : 500,
  };

  if (typeof error.status === 'string') {
    init.statusText = error.status;
  }

  return init;
};

export const toAuthErrorResponse = (error: unknown): Response | null => {
  if (!isApiErrorLike(error)) {
    return null;
  }

  const init = toResponseInit(error);
  const { body } = error;

  if (body === undefined) {
    return new Response(null, init);
  }

  if (typeof body === 'string') {
    if (init.headers instanceof Headers && !init.headers.has('content-type')) {
      init.headers.set('content-type', 'text/plain');
    }
    return new Response(body, init);
  }

  return Response.json(body, init);
};
