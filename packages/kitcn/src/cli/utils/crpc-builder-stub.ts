export const CRPC_BUILDER_STUB_SOURCE = `const createMiddleware = (handler = undefined) => ({
  _handler: handler,
  pipe(nextHandler = undefined) {
    return createMiddleware(nextHandler);
  },
});

const toMetaObject = (value = undefined) =>
  value && typeof value === "object" ? value : {};

const createProcedureExport = (type, state, handler) => ({
  _crpcMeta: {
    type,
    internal: state.internal ?? false,
    ...toMetaObject(state.meta),
  },
  _handler: handler,
});

const createProcedureBuilder = (state = {}) => {
  const builder = {
    internal() {
      return createProcedureBuilder({ ...state, internal: true });
    },
    use() {
      return createProcedureBuilder(state);
    },
    meta(value = undefined) {
      return createProcedureBuilder({
        ...state,
        meta: {
          ...toMetaObject(state.meta),
          ...toMetaObject(value),
        },
      });
    },
    input() {
      return createProcedureBuilder(state);
    },
    paginated(options = undefined) {
      return createProcedureBuilder({
        ...state,
        meta:
          typeof options?.limit === "number"
            ? {
                ...toMetaObject(state.meta),
                limit: options.limit,
              }
            : state.meta,
      });
    },
    output() {
      return createProcedureBuilder(state);
    },
    query(handler = undefined) {
      return createProcedureExport("query", state, handler);
    },
    mutation(handler = undefined) {
      return createProcedureExport("mutation", state, handler);
    },
    action(handler = undefined) {
      return createProcedureExport("action", state, handler);
    },
    middleware(handler = undefined) {
      return createMiddleware(handler);
    },
  };

  return builder;
};

export const initCRPC = {
  meta() {
    return this;
  },
  dataModel() {
    return this;
  },
  context() {
    return this;
  },
  middleware(handler = undefined) {
    return createMiddleware(handler);
  },
  create() {
    return {
      query: createProcedureBuilder(),
      mutation: createProcedureBuilder(),
      action: createProcedureBuilder(),
      httpAction: createProcedureBuilder(),
      middleware: createMiddleware,
      router: (record = {}) => record,
    };
  },
};

export const httpAction = createProcedureBuilder();
`;
