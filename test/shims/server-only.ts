// Empty stand-in for the real `server-only` package under vitest. The real
// package throws when imported in a non-RSC-server context; aliasing to this
// (see vitest.config.ts) lets server-only modules be imported in unit tests.
export {};
