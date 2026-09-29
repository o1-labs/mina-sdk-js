import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', itn: 'src/itn/index.ts' },
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
