import fs, { readFile, writeFile } from 'fs/promises';
import { pathToFileURL } from 'url';
import { jest } from '@jest/globals';
import dedent from 'dedent';
import { createFixtures, FIXTURE_DIR_PATH, getFixturePath } from '../test/util.js';
import { sleepSync } from '../util.js';

const readFileSpy = jest.spyOn(fs, 'readFile');
// In ESM, for some reason, we need to explicitly mock module
jest.unstable_mockModule('fs/promises', () => ({
  ...fs, // Inherit native functions (e.g., fs.stat)
  readFile: readFileSpy,
}));

// After the mock of fs/promises is complete, . /index.js after the mock of fs/promises is complete.
// ref: https://www.coolcomputerclub.com/posts/jest-hoist-await/
const { Loader } = await import('./index.js');
// NOTE: ../test/util.js depends on . /index.js, so it must also be imported dynamically...

const loader = new Loader();

afterEach(() => {
  readFileSpy.mockClear();
});

test('basic', async () => {
  createFixtures({
    '/test/1.css': dedent`
    .a {}
    .b {}
    `,
  });
  const result = await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href);
  expect(result).toMatchInlineSnapshot(`
    {
      dependencies: [],
      tokens: [
        {
          name: "a",
          originalLocations: [
            { filePath: "<fixtures>/test/1.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
        {
          name: "b",
          originalLocations: [
            { filePath: "<fixtures>/test/1.css", start: { line: 2, column: 1 }, end: { line: 2, column: 2 } },
          ],
        },
      ],
    }
  `);
});

test('tracks other files when `@import` is present', async () => {
  createFixtures({
    '/test/1.css': dedent`
    @import './2.css';
    @import '3.css';
    @import '${getFixturePath('/test/4.css')}';
    `,
    '/test/2.css': dedent`
    .a {}
    `,
    '/test/3.css': dedent`
    .b {}
    `,
    '/test/4.css': dedent`
    .c {}
    `,
  });
  const result = await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href);
  expect(result).toMatchInlineSnapshot(`
    {
      dependencies: ["<fixtures>/test/2.css", "<fixtures>/test/3.css", "<fixtures>/test/4.css"],
      tokens: [
        {
          name: "a",
          originalLocations: [
            { filePath: "<fixtures>/test/2.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
        {
          name: "b",
          originalLocations: [
            { filePath: "<fixtures>/test/3.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
        {
          name: "c",
          originalLocations: [
            { filePath: "<fixtures>/test/4.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
      ],
    }
  `);
});

test('tracks other files when `composes` is present', async () => {
  createFixtures({
    '/test/1.css': dedent`
    .a {
      composes: b from './2.css';
      composes: c d from './3.css';
      composes: e from '${getFixturePath('/test/4.css')}';
    }
    `,
    '/test/2.css': dedent`
    .b {}
    `,
    '/test/3.css': dedent`
    .c {}
    .d {}
    `,
    '/test/4.css': dedent`
    .e {}
    `,
  });
  const result = await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href);
  expect(result).toMatchInlineSnapshot(`
    {
      dependencies: ["<fixtures>/test/2.css", "<fixtures>/test/3.css", "<fixtures>/test/4.css"],
      tokens: [
        {
          name: "a",
          originalLocations: [
            { filePath: "<fixtures>/test/1.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
        {
          name: "b",
          originalLocations: [
            { filePath: "<fixtures>/test/2.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
        {
          name: "c",
          originalLocations: [
            { filePath: "<fixtures>/test/3.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
        {
          name: "d",
          originalLocations: [
            { filePath: "<fixtures>/test/3.css", start: { line: 2, column: 1 }, end: { line: 2, column: 2 } },
          ],
        },
        {
          name: "e",
          originalLocations: [
            { filePath: "<fixtures>/test/4.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
      ],
    }
  `);
});

test('normalizes tokens', async () => {
  createFixtures({
    '/test/1.css': dedent`
    /* duplicate import */
    @import './2.css';
    @import '2.css';
    .a {
      /* duplicate composes */
      composes: c from './3.css';
      composes: c from '3.css';
      composes: c c from './3.css';
      /* duplicate import and composes */
      composes: b from './2.css';
    }
    .a {} /* duplicate class selector */
    `,
    '/test/2.css': dedent`
    .a {} /* class selector that duplicates the import source */
    .b {}
    `,
    '/test/3.css': dedent`
    .c {}
    `,
  });
  const result = await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href);
  expect(result).toMatchInlineSnapshot(`
    {
      dependencies: ["<fixtures>/test/2.css", "<fixtures>/test/3.css"],
      tokens: [
        {
          name: "a",
          originalLocations: [
            { filePath: "<fixtures>/test/2.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
            { filePath: "<fixtures>/test/1.css", start: { line: 4, column: 1 }, end: { line: 4, column: 2 } },
            { filePath: "<fixtures>/test/1.css", start: { line: 12, column: 1 }, end: { line: 12, column: 2 } },
          ],
        },
        {
          name: "b",
          originalLocations: [
            { filePath: "<fixtures>/test/2.css", start: { line: 2, column: 1 }, end: { line: 2, column: 2 } },
          ],
        },
        {
          name: "c",
          originalLocations: [
            { filePath: "<fixtures>/test/3.css", start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
          ],
        },
      ],
    }
  `);
});

test.failing('returns the result from the cache when the file has not been modified', async () => {
  createFixtures({
    '/test/1.css': dedent`
    @import './2.css';
    @import './2.css';
    .a {
      composes: b from './2.css';
      composes: c from './3.css';
      composes: d from './3.css';
    }
    `,
    '/test/2.css': dedent`
    .b {}
    `,
    '/test/3.css': dedent`
    .c {}
    .d {}
    `,
  });
  await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href);
  expect(readFileSpy).toHaveBeenCalledTimes(3);
  expect(readFileSpy).toHaveBeenNthCalledWith(1, '/test/1.css', 'utf-8');
  expect(readFileSpy).toHaveBeenNthCalledWith(2, '/test/2.css', 'utf-8');
  expect(readFileSpy).toHaveBeenNthCalledWith(3, '/test/3.css', 'utf-8');
  readFileSpy.mockClear();

  // update `/test/2.css`
  sleepSync(1); // wait for the file system to update the mtime
  await writeFile(getFixturePath('/test/2.css'), await readFile(getFixturePath('/test/2.css'), 'utf-8'));

  // `3.css` is not updated, so the cache is used. Therefore, `readFile` is not called.
  await loader.load(pathToFileURL(getFixturePath('/test/3.css')).href);
  expect(readFileSpy).toHaveBeenCalledTimes(0);

  // `1.css` is not updated, but dependencies are updated, so the cache is used. Therefore, `readFile` is called.
  await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href);
  expect(readFileSpy).toHaveBeenCalledTimes(2);
  expect(readFileSpy).toHaveBeenNthCalledWith(1, '/test/1.css', 'utf-8');
  expect(readFileSpy).toHaveBeenNthCalledWith(2, '/test/2.css', 'utf-8');

  // ``2.css` is updated, but the cache is already available because it was updated in the previous step. Therefore, `readFile` is not called.
  await loader.load(pathToFileURL(getFixturePath('/test/2.css')).href);
  expect(readFileSpy).toHaveBeenCalledTimes(2);
});

test('ignores the composition of non-existent tokens', async () => {
  // In css-loader and postcss-modules, compositions of non-existent tokens are simply ignored.
  // Therefore, happy-css-modules follows suit.
  // It may be preferable to warn rather than ignore, but for now, we will focus on compatibility.
  // ref: https://github.com/css-modules/css-modules/issues/356
  createFixtures({
    '/test/1.css': dedent`
    .a {
      composes: b c from './2.css';
    }
    `,
    '/test/2.css': dedent`
    .b {}
    `,
  });
  const result = await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href);
  expect(result.tokens.map((t) => t.name)).toStrictEqual(['a', 'b']);
});

test('throws error the composition of non-existent file', async () => {
  // In postcss-modules, compositions of non-existent file are causes an error.
  // Therefore, happy-css-modules follows suit.
  createFixtures({
    '/test/1.css': dedent`
    .a {
      composes: a from './2.css';
    }
    `,
  });
  await expect(async () => {
    await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href).catch((e) => {
      e.message = e.message.replace(FIXTURE_DIR_PATH, '<fixtures>');
      throw e;
    });
  }).rejects.toThrowError(`Could not resolve './2.css' in 'file://<fixtures>/test/1.css'`);
});

test.todo('supports sourcemap file and inline sourcemap');

test('ignores http(s) protocol file', async () => {
  createFixtures({
    '/test/1.css': dedent`
    @import 'http://example.com/path/1.css';
    @import 'https://example.com/path/1.css';
    `,
  });
  const result = await loader.load(pathToFileURL(getFixturePath('/test/1.css')).href);
  expect(result.dependencies).toStrictEqual([]);
});
