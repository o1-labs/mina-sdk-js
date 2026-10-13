import { defineConfig } from 'tsup';

export default defineConfig({
  // verify is its own entry point: it loads the proof backend with Node's
  // module and path APIs, which the main entry point must not import, so
  // that browsers (bundlers) can use the client.
  entry: { index: 'src/index.ts', itn: 'src/itn/index.ts', verify: 'src/verify.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  // Shared chunks, so the main and the itn entry points use the same error
  // classes (instanceof GraphQLError works across them).
  splitting: true,
  treeshake: true,
});
