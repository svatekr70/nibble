import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Round-trip a serializace se testují nad linkedom — je to skutečný DOM
    // parser, ne regulární výrazy, takže testy měří to, co poběží v prohlížeči.
    // Selection a beforeinput sem nepatří; ty jdou do Playwrightu ve fázi F1.
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts'],
  },
});
