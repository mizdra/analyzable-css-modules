import fs from 'fs/promises';
import { jest } from '@jest/globals';
import dedent from 'dedent';
import { createFixtures, getFixturePath } from '../test/util.js';

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
  const result = await loader.load(getFixturePath('/test/1.css'));
  expect(result).toMatchInlineSnapshot(`
    {
      "dependencies": [],
      "tokens": [
        {
          "name": "a",
          "originalLocations": [
            { "filePath": "<fixtures>/test/1.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        },
        {
          "name": "b",
          "originalLocations": [
            { "filePath": "<fixtures>/test/1.css", "start": { "line": 2, "column": 1 }, "end": { "line": 2, "column": 1 } }
          ]
        }
      ]
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
  const result = await loader.load(getFixturePath('/test/1.css'));
  expect(result).toMatchInlineSnapshot(`
    {
      "dependencies": ["<fixtures>/test/2.css", "<fixtures>/test/3.css", "<fixtures>/test/4.css"],
      "tokens": [
        {
          "name": "a",
          "originalLocations": [
            { "filePath": "<fixtures>/test/2.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        },
        {
          "name": "b",
          "originalLocations": [
            { "filePath": "<fixtures>/test/3.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        },
        {
          "name": "c",
          "originalLocations": [
            { "filePath": "<fixtures>/test/4.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        }
      ]
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
  const result = await loader.load(getFixturePath('/test/1.css'));
  expect(result).toMatchInlineSnapshot(`
    {
      "dependencies": ["<fixtures>/test/2.css", "<fixtures>/test/3.css", "<fixtures>/test/4.css"],
      "tokens": [
        {
          "name": "a",
          "originalLocations": [
            { "filePath": "<fixtures>/test/1.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        },
        {
          "name": "b",
          "originalLocations": [
            { "filePath": "<fixtures>/test/2.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        },
        {
          "name": "c",
          "originalLocations": [
            { "filePath": "<fixtures>/test/3.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        },
        {
          "name": "d",
          "originalLocations": [
            { "filePath": "<fixtures>/test/3.css", "start": { "line": 2, "column": 1 }, "end": { "line": 2, "column": 1 } }
          ]
        },
        {
          "name": "e",
          "originalLocations": [
            { "filePath": "<fixtures>/test/4.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        }
      ]
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
  const result = await loader.load(getFixturePath('/test/1.css'));
  expect(result).toMatchInlineSnapshot(`
    {
      "dependencies": ["<fixtures>/test/2.css", "<fixtures>/test/3.css"],
      "tokens": [
        {
          "name": "a",
          "originalLocations": [
            { "filePath": "<fixtures>/test/2.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } },
            { "filePath": "<fixtures>/test/1.css", "start": { "line": 4, "column": 1 }, "end": { "line": 4, "column": 1 } },
            {
              "filePath": "<fixtures>/test/1.css",
              "start": { "line": 12, "column": 1 },
              "end": { "line": 12, "column": 1 }
            }
          ]
        },
        {
          "name": "b",
          "originalLocations": [
            { "filePath": "<fixtures>/test/2.css", "start": { "line": 2, "column": 1 }, "end": { "line": 2, "column": 1 } }
          ]
        },
        {
          "name": "c",
          "originalLocations": [
            { "filePath": "<fixtures>/test/3.css", "start": { "line": 1, "column": 1 }, "end": { "line": 1, "column": 1 } }
          ]
        }
      ]
    }
  `);
});

test.failing('returns the result from the cache when the file has not been modified', async () => {
  const content1 = dedent`
  @import './2.css';
  @import './2.css';
  .a {
    composes: b from './2.css';
    composes: c from './3.css';
    composes: d from './3.css';
  }
  `;
  const content2 = dedent`
  .b {}
  `;
  const content3 = dedent`
  .c {}
  .d {}
  `;
  createFixtures({
    '/test/1.css': { content: content1, mtime: new Date(0) },
    '/test/2.css': { content: content2, mtime: new Date(0) },
    '/test/3.css': { content: content3, mtime: new Date(0) },
  });
  await loader.load(getFixturePath('/test/1.css'));
  expect(readFileSpy).toHaveBeenCalledTimes(3);
  expect(readFileSpy).toHaveBeenNthCalledWith(1, '/test/1.css', 'utf-8');
  expect(readFileSpy).toHaveBeenNthCalledWith(2, '/test/2.css', 'utf-8');
  expect(readFileSpy).toHaveBeenNthCalledWith(3, '/test/3.css', 'utf-8');
  readFileSpy.mockClear();

  // update `/test/2.css`
  createFixtures({
    '/test/1.css': { content: content1, mtime: new Date(0) },
    '/test/2.css': { content: content2, mtime: new Date(1) },
    '/test/3.css': { content: content3, mtime: new Date(0) },
  });
  // `3.css` is not updated, so the cache is used. Therefore, `readFile` is not called.
  await loader.load(getFixturePath('/test/3.css'));
  expect(readFileSpy).toHaveBeenCalledTimes(0);

  // `1.css` is not updated, but dependencies are updated, so the cache is used. Therefore, `readFile` is called.
  await loader.load(getFixturePath('/test/1.css'));
  expect(readFileSpy).toHaveBeenCalledTimes(2);
  expect(readFileSpy).toHaveBeenNthCalledWith(1, '/test/1.css', 'utf-8');
  expect(readFileSpy).toHaveBeenNthCalledWith(2, '/test/2.css', 'utf-8');

  // ``2.css` is updated, but the cache is already available because it was updated in the previous step. Therefore, `readFile` is not called.
  await loader.load(getFixturePath('/test/2.css'));
  expect(readFileSpy).toHaveBeenCalledTimes(2);
});

test('ignores the composition of non-existent tokens', async () => {
  // In css-loader and postcss-modules, compositions of non-existent tokens are simply ignored.
  // Therefore, enhanced-typed-css-modules follows suit.
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
  const result = await loader.load(getFixturePath('/test/1.css'));
  expect(result.tokens.map((t) => t.name)).toStrictEqual(['a', 'b']);
});

test('throws error the composition of non-existent file', async () => {
  // In postcss-modules, compositions of non-existent file are causes an error.
  // Therefore, enhanced-typed-css-modules follows suit.
  createFixtures({
    '/test/1.css': dedent`
    .a {
      composes: a from './2.css';
    }
    `,
  });
  // TODO: better error message
  await expect(async () => {
    await loader.load(getFixturePath('/test/1.css'));
  }).rejects.toThrowError(/ENOENT: no such file or directory/);
});

test.todo('supports sourcemap file and inline sourcemap');
