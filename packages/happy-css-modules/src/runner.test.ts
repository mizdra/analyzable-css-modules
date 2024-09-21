import { readFile, rm, symlink, writeFile } from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as fileCacheCore from '@file-cache/core';
import type { CreateCacheOptions } from '@file-cache/core';
import { jest } from '@jest/globals';
import dedent from 'dedent';
import type { RunnerOptions, Watcher } from './runner.js';
import { createFixtures, exists, getFixturePath, waitForAsyncTask } from './test-util/util.js';

const require = createRequire(import.meta.url);

const uuid = randomUUID();
jest.unstable_mockModule('@file-cache/core', () => ({
  ...fileCacheCore, // Inherit native functions
  createCache: async (options: CreateCacheOptions) => {
    options.keys.push(() => uuid); // Add a random key to avoid cache collision
    return fileCacheCore.createCache(options);
  },
}));

const { run } = await import('./runner.js');

// eslint-disable-next-line @typescript-eslint/no-empty-function
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
// eslint-disable-next-line @typescript-eslint/no-empty-function
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

const defaultOptions: RunnerOptions = {
  pattern: 'test/**/*.{css,scss}',
  declarationMap: true,
  logLevel: 'silent',
  cwd: getFixturePath('/'),
  cache: false,
};

const dir = join(dirname(fileURLToPath(import.meta.url)));

beforeEach(async () => {
  consoleLogSpy.mockClear();
  consoleErrorSpy.mockClear();
  await rm(resolve(dir, '../node_modules/.cache/happy-css-modules'), { recursive: true, force: true }); // clear cache
});

// Exit the watcher even if the test fails
let watcher: Watcher | undefined;
afterEach(async () => {
  if (watcher) {
    await watcher.close();
  }
});

test('generates .d.ts and .d.ts.map', async () => {
  createFixtures({
    '/test/1.css': '.a {}',
    '/test/2.css': '.b {}',
  });
  await run({ ...defaultOptions });
  expect(await readFile(getFixturePath('/test/1.css.d.ts'), 'utf8')).toMatchSnapshot();
  expect(await readFile(getFixturePath('/test/1.css.d.ts.map'), 'utf8')).toMatchSnapshot();
  expect(await readFile(getFixturePath('/test/2.css.d.ts'), 'utf8')).toMatchSnapshot();
  expect(await readFile(getFixturePath('/test/2.css.d.ts.map'), 'utf8')).toMatchSnapshot();
});

test('uses cache in non-watch mode', async () => {
  createFixtures({
    '/test/1.css': '.a {}',
  });
  await run({ ...defaultOptions, declarationMap: true, logLevel: 'debug', cache: true });
  expect(consoleLogSpy).toBeCalledTimes(2);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expect.anything(), expect.stringContaining('Generate .d.ts for'));
  expect(consoleLogSpy).toHaveBeenNthCalledWith(2, expect.anything(), expect.stringContaining('generated'));
  consoleLogSpy.mockClear();

  // Skip generation
  await run({ ...defaultOptions, declarationMap: true, logLevel: 'debug', cache: true });
  expect(consoleLogSpy).toBeCalledTimes(2);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expect.anything(), expect.stringContaining('Generate .d.ts for'));
  expect(consoleLogSpy).toHaveBeenNthCalledWith(2, expect.anything(), expect.stringContaining('skipped'));
  consoleLogSpy.mockClear();

  // Generates if generated files are missing
  await rm(getFixturePath('/test/1.css.d.ts'));
  await run({ ...defaultOptions, declarationMap: true, logLevel: 'debug', cache: true });
  expect(consoleLogSpy).toBeCalledTimes(2);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expect.anything(), expect.stringContaining('Generate .d.ts for'));
  expect(consoleLogSpy).toHaveBeenNthCalledWith(2, expect.anything(), expect.stringContaining('generated'));
  consoleLogSpy.mockClear();

  // Generates if options are changed
  await run({ ...defaultOptions, declarationMap: false, logLevel: 'debug', cache: true });
  expect(consoleLogSpy).toBeCalledTimes(2);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expect.anything(), expect.stringContaining('Generate .d.ts for'));
  expect(consoleLogSpy).toHaveBeenNthCalledWith(2, expect.anything(), expect.stringContaining('generated'));
  consoleLogSpy.mockClear();
});

test('uses cache in watch mode', async () => {
  createFixtures({
    '/test/1.css': '.a-1 {}',
    '/test/2.css': '.b-1 {}',
  });

  // At first, process all files
  watcher = await run({ ...defaultOptions, declarationMap: true, logLevel: 'debug', cache: true, watch: true });
  await waitForAsyncTask(1000); // Wait until the watcher is ready
  expect(consoleLogSpy).toBeCalledTimes(3);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(
    1,
    expect.anything(),
    expect.stringContaining('Watch test/**/*.{css,scss}...'),
  );
  expect(consoleLogSpy).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    expect.stringContaining('test/1.css (generated)'),
  );
  expect(consoleLogSpy).toHaveBeenNthCalledWith(
    3,
    expect.anything(),
    expect.stringContaining('test/2.css (generated)'),
  );
  consoleLogSpy.mockClear();

  // Updating 1.css, it will only be processed
  await writeFile(getFixturePath('/test/1.css'), '.a-2 {}');
  await waitForAsyncTask(500); // Wait until the file is written
  expect(consoleLogSpy).toBeCalledTimes(1);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(
    1,
    expect.anything(),
    expect.stringContaining('test/1.css (generated)'),
  );

  // Close the watcher
  await watcher.close();
  consoleLogSpy.mockClear();

  // Update 1.css
  await writeFile(getFixturePath('/test/1.css'), '.a-1 {}');
  await waitForAsyncTask(500); // Wait until the file is written

  // The updated 1.css will be processed, and the non-updated 2.css will be skipped.
  // eslint-disable-next-line require-atomic-updates
  watcher = await run({ ...defaultOptions, declarationMap: true, logLevel: 'debug', cache: true, watch: true });
  await waitForAsyncTask(1000); // Wait until the watcher is ready
  expect(consoleLogSpy).toBeCalledTimes(3);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(
    1,
    expect.anything(),
    expect.stringContaining('Watch test/**/*.{css,scss}...'),
  );
  expect(consoleLogSpy).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    expect.stringContaining('test/1.css (generated)'),
  );
  expect(consoleLogSpy).toHaveBeenNthCalledWith(3, expect.anything(), expect.stringContaining('test/2.css (skipped)'));
});

test('outputs logs', async () => {
  createFixtures({
    '/test/1.css': '.a {}',
  });
  await run({ ...defaultOptions, logLevel: 'debug', cache: true });
  expect(consoleLogSpy).toBeCalledTimes(2);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expect.anything(), expect.stringContaining('Generate .d.ts for'));
  expect(consoleLogSpy).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    expect.stringContaining('test/1.css (generated)'),
  );
  consoleLogSpy.mockClear();

  await run({ ...defaultOptions, logLevel: 'debug', cache: true });
  expect(consoleLogSpy).toBeCalledTimes(2);
  expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expect.anything(), expect.stringContaining('Generate .d.ts for'));
  expect(consoleLogSpy).toHaveBeenNthCalledWith(2, expect.anything(), expect.stringContaining('test/1.css (skipped)'));
});

test.todo('changes dts format with localsConvention options');
test('does not emit declaration map if declarationMap is false', async () => {
  createFixtures({
    '/test/1.css': '.a {}',
  });
  await run({ ...defaultOptions, declarationMap: false });
  await expect(readFile(getFixturePath('/test/1.css.d.ts'), 'utf8')).resolves.not.toThrow();
  await expect(readFile(getFixturePath('/test/1.css.d.ts.map'), 'utf8')).rejects.toThrow(/ENOENT/u);
});
test('supports transformer', async () => {
  createFixtures({
    '/test/1.scss': `.a { dummy: ''; }`,
  });
  await run({ ...defaultOptions });
  expect(await readFile(getFixturePath('/test/1.scss.d.ts'), 'utf8')).toMatchSnapshot();
  expect(await readFile(getFixturePath('/test/1.scss.d.ts.map'), 'utf8')).toMatchSnapshot();
});
test('watches for changes in files', async () => {
  createFixtures({
    '/test': {}, // empty directory
  });
  watcher = await run({ ...defaultOptions, watch: true });

  await writeFile(getFixturePath('/test/1.css'), '.a-1 {}');
  await waitForAsyncTask(500); // Wait until the file is written
  expect(await readFile(getFixturePath('/test/1.css.d.ts'), 'utf8')).toMatch(/a-1/u);

  await writeFile(getFixturePath('/test/1.css'), '.a-2 {}');
  await waitForAsyncTask(500); // Wait until the file is written
  expect(await readFile(getFixturePath('/test/1.css.d.ts'), 'utf8')).toMatch(/a-2/u);

  await writeFile(getFixturePath('/test/2.css'), '.b {}');
  await writeFile(getFixturePath('/test/3.css'), '.c {}');
  await waitForAsyncTask(500); // Wait until the file is written
  expect(await readFile(getFixturePath('/test/2.css.d.ts'), 'utf8')).toMatch(/b/u);
  expect(await readFile(getFixturePath('/test/3.css.d.ts'), 'utf8')).toMatch(/c/u);
});
test('returns an error if the file fails to process in non-watch mode', async () => {
  createFixtures({
    '/test/1.css': '.a {}',
    '/test/2.css': 'INVALID SYNTAX',
    '/test/3.css': 'INVALID SYNTAX',
  });
  const maybeError = await run({ ...defaultOptions, watch: false }).catch((e) => e);

  // The errors are aggregated into AggregateError.
  expect(maybeError).toBeInstanceOf(AggregateError);
  const error = maybeError as AggregateError;
  expect(error.message).toMatchInlineSnapshot(`"Failed to process files"`);
  expect(error.errors).toHaveLength(2);
  expect(error.errors[0]).toMatchInlineSnapshot(`<fixtures>/test/3.css:1:1: Unknown word`);
  expect(error.errors[1]).toMatchInlineSnapshot(`<fixtures>/test/2.css:1:1: Unknown word`);

  // The valid files are emitted.
  expect(await exists(getFixturePath('/test/1.css.d.ts'))).toBe(true);
  expect(await exists(getFixturePath('/test/1.css.d.ts.map'))).toBe(true);
});
describe('handles external files', () => {
  beforeEach(() => {
    createFixtures({
      '/test/1.css': dedent`
      @import './2.css';
      @import 'external-library';
      .a {}
      `,
      '/test/2.css': `.b {}`,
      '/node_modules/external-library/index.css': `.c {}`,
    });
  });
  test('do not emit .dts for external files', async () => {
    await run({ ...defaultOptions });
    expect(await exists(getFixturePath('/test/1.css.d.ts'))).toBe(true);
    expect(await exists(getFixturePath('/test/2.css.d.ts'))).toBe(true);
    expect(await exists(getFixturePath('/node_modules/external-library/index.css.d.ts'))).toBe(false);
  });
  test('treats imported tokens from external files the same as local tokens', async () => {
    await run({ ...defaultOptions });
    expect(await readFile(getFixturePath('/test/1.css.d.ts'), 'utf8')).toMatchInlineSnapshot(`
          "declare const styles:
            & Readonly<Pick<(typeof import("./2.css"))["default"], "b">>
            & Readonly<{ "c": string }>
            & Readonly<{ "a": string }>
          ;
          export default styles;
          //# sourceMappingURL=./1.css.d.ts.map
          "
      `);
  });
});

test('sassLoadPaths', async () => {
  const sassLoadPaths = ['test/relative'];
  createFixtures({
    '/test/1.scss': dedent`
    @import '2.scss';
    `,
    '/test/relative/2.scss': `.a { dummy: ''; }`,
  });
  await run({ ...defaultOptions, sassLoadPaths }); // not throw
});

test('lessIncludePaths', async () => {
  const lessIncludePaths = ['test/relative'];
  createFixtures({
    '/test/1.less': dedent`
    @import '2.less';
    `,
    '/test/relative/2.less': `.a { dummy: ''; }`,
  });
  await run({ ...defaultOptions, lessIncludePaths }); // not throw
});

test('webpackResolveAlias', async () => {
  const webpackResolveAlias = { '@relative': 'test/relative' };
  createFixtures({
    '/test/1.less': dedent`
    @import '@relative/2.less';
    `,
    '/test/relative/2.less': `.a { dummy: ''; }`,
  });
  await run({ ...defaultOptions, webpackResolveAlias }); // not throw
});

test('postcssConfig', async () => {
  const uuid = randomUUID();
  const postcssConfig = `${uuid}/postcss.config.js`;
  createFixtures({
    [`/${uuid}/postcss.config.js`]: dedent`
    module.exports = {
      plugins: [
        require('${require.resolve('postcss-simple-vars')}'),
      ],
    };
    `,
    '/test/1.css': dedent`
    $prefix: foo;
    .$(prefix)_bar {}
    `,
  });
  await run({ ...defaultOptions, postcssConfig }); // not throw
});

test('support symlink', async () => {
  createFixtures({
    '/external/1.css': '.a {}',
    '/external/2.css': '.b {}',
    '/test': {}, // empty directory
  });
  await symlink(getFixturePath('/external/1.css'), getFixturePath('/test/1.css'));
  await symlink(getFixturePath('/external/2.css'), getFixturePath('/test/2.txt'));

  await run({ ...defaultOptions, watch: false });

  // Symlinks that do not match the pattern are not processed.
  expect(await exists(getFixturePath('/test/1.css.d.ts'))).toBe(true);
  expect(await exists(getFixturePath('/test/2.css.d.ts'))).toBe(false);
  expect(await exists(getFixturePath('/test/2.txt.d.ts'))).toBe(false);

  // The path referred to by sourceMappingURL or sources field is the path before symlink resolution.
  expect(await readFile(getFixturePath('/test/1.css.d.ts'), 'utf8')).toMatchInlineSnapshot(`
    "declare const styles:
      & Readonly<{ "a": string }>
    ;
    export default styles;
    //# sourceMappingURL=./1.css.d.ts.map
    "
  `);
  expect(await readFile(getFixturePath('/test/1.css.d.ts.map'), 'utf8')).toMatchInlineSnapshot(
    `"{"version":3,"sources":["./1.css"],"names":["a"],"mappings":"AAAA;AAAA,E,aAAAA,G,WAAA;AAAA;AAAA","file":"1.css.d.ts","sourceRoot":""}"`,
  );
});

test('regenerate .d.ts if dependent files are updated', async () => {
  createFixtures({
    '/test/1.scss': '@import "./2.scss"',
    '/test/2.scss': '.a { dummy: ""; }',
  });
  await run({ ...defaultOptions, cache: true });
  const content1 = await readFile(getFixturePath('/test/1.scss.d.ts'), 'utf8');

  // Update 2.scss
  await writeFile(getFixturePath('/test/2.scss'), '.b { dummy: ""; }');
  await run({ ...defaultOptions, cache: true });
  const content2 = await readFile(getFixturePath('/test/1.scss.d.ts'), 'utf8');
  expect(content1).not.toEqual(content2);
});
