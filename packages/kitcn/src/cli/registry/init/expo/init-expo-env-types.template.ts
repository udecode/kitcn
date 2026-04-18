export const INIT_EXPO_ENV_TYPES_TEMPLATE = `/// <reference types="expo/types" />

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
`;
