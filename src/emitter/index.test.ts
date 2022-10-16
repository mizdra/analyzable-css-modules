import { readFile, stat } from 'fs/promises';
import { jest } from '@jest/globals';
import chalk from 'chalk';
import { createFixtures, exists, fakeToken, getFixturePath, waitForAsyncTask } from '../test/util.js';
import { emitGeneratedFiles, getRelativePath, isSubDirectoryFile } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

beforeEach(() => {
  consoleLogSpy.mockClear();
});

test('getRelativePath', () => {
  expect(getRelativePath('/test/1.css.d.ts', '/test/1.css')).toBe('./1.css');
  expect(getRelativePath('/test/1.css.d.ts', '/test/dir/1.css')).toBe('./dir/1.css');
  expect(getRelativePath('/test/1.css.d.ts', '/1.css')).toBe('../1.css');
});

test('isSubDirectoryFile', () => {
  expect(isSubDirectoryFile('/test', '/test/src/1.css')).toBe(true);
  expect(isSubDirectoryFile('/test', '/test/dist/1.css')).toBe(true);
  expect(isSubDirectoryFile('/test', '/1.css')).toBe(false);
});

describe('emitGeneratedFiles', () => {
  const defaultArgs = {
    filePath: getFixturePath('/test/1.css'),
    tokens: [fakeToken({ name: 'foo', originalLocations: [{ start: { line: 1, column: 1 } }] })],
    distOptions: undefined,
    emitDeclarationMap: true,
    dtsFormatOptions: undefined,
    silent: true,
    cwd: getFixturePath('/test'),
    isExternalFile: () => false,
  };
  beforeEach(() => {
    createFixtures({
      '/test': {}, // empty directory
    });
  });
  test('generates .d.ts and .d.ts.map', async () => {
    await emitGeneratedFiles({ ...defaultArgs });
    expect(await exists(getFixturePath('/test/1.css.d.ts'))).toBeTruthy();
    // A link to the source map is embedded.
    expect(await readFile(getFixturePath('/test/1.css.d.ts'), 'utf8')).toEqual(
      expect.stringContaining('//# sourceMappingURL=./1.css.d.ts.map'),
    );
    expect(await exists(getFixturePath('/test/1.css.d.ts.map'))).toBeTruthy();
  });
  test('generates only .d.ts and .d.ts.map if emitDeclarationMap is false', async () => {
    await emitGeneratedFiles({ ...defaultArgs, emitDeclarationMap: false });
    expect(await exists(getFixturePath('/test/1.css.d.ts'))).toBeTruthy();
    // A link to the source map is not embedded.
    expect(await readFile(getFixturePath('/test/1.css.d.ts'), 'utf8')).toEqual(
      expect.not.stringContaining('//# sourceMappingURL=1.css.d.ts.map'),
    );
    expect(await exists(getFixturePath('/test/1.css.d.ts.map'))).toBeFalsy();
  });
  test('skips writing to disk if the generated files are the same', async () => {
    const tokens1 = [fakeToken({ name: 'foo', originalLocations: [{ start: { line: 1, column: 1 } }] })];
    await emitGeneratedFiles({ ...defaultArgs, tokens: tokens1 });
    const mtimeForDts1 = (await stat(getFixturePath('/test/1.css.d.ts'))).mtime;
    const mtimeForSourceMap1 = (await stat(getFixturePath('/test/1.css.d.ts.map'))).mtime;

    await waitForAsyncTask(1); // so that mtime changes.
    await emitGeneratedFiles({ ...defaultArgs, tokens: tokens1 });
    const mtimeForDts2 = (await stat(getFixturePath('/test/1.css.d.ts'))).mtime;
    const mtimeForSourceMap2 = (await stat(getFixturePath('/test/1.css.d.ts.map'))).mtime;
    expect(mtimeForDts1).toEqual(mtimeForDts2); // skipped
    expect(mtimeForSourceMap1).toEqual(mtimeForSourceMap2); // skipped

    await waitForAsyncTask(1); // so that mtime changes.
    const tokens2 = [fakeToken({ name: 'bar', originalLocations: [{ start: { line: 1, column: 1 } }] })];
    await emitGeneratedFiles({ ...defaultArgs, tokens: tokens2 });
    const mtimeForDts3 = (await stat(getFixturePath('/test/1.css.d.ts'))).mtime;
    const mtimeForSourceMap3 = (await stat(getFixturePath('/test/1.css.d.ts.map'))).mtime;
    expect(mtimeForDts1).not.toEqual(mtimeForDts3); // not skipped
    expect(mtimeForSourceMap1).not.toEqual(mtimeForSourceMap3); // not skipped
  });
  test('outputs write log', async () => {
    await emitGeneratedFiles({
      ...defaultArgs,
      filePath: getFixturePath('/test/1.css'),
      emitDeclarationMap: true,
      silent: false,
    });
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenNthCalledWith(1, `Generated .d.ts and .d.ts.map for ${chalk.green('1.css')}`);
    consoleLogSpy.mockClear();

    await emitGeneratedFiles({
      ...defaultArgs,
      filePath: getFixturePath('/test/2.css'),
      emitDeclarationMap: false,
      silent: false,
    });
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenNthCalledWith(1, `Generated .d.ts for ${chalk.green('2.css')}`);
    consoleLogSpy.mockClear();

    await emitGeneratedFiles({
      ...defaultArgs,
      filePath: getFixturePath('/test/3.css'),
      emitDeclarationMap: false,
      silent: true,
    });
    expect(consoleLogSpy).toHaveBeenCalledTimes(0);
  });
  test('changes working directory by cwd', async () => {
    await emitGeneratedFiles({
      ...defaultArgs,
      filePath: getFixturePath('/test/1.css'),
      emitDeclarationMap: false,
      silent: false,
      cwd: getFixturePath('/test'),
    });
    await emitGeneratedFiles({
      ...defaultArgs,
      filePath: getFixturePath('/test/1.css'),
      emitDeclarationMap: false,
      silent: false,
      cwd: getFixturePath('/'),
    });
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenNthCalledWith(1, `Generated .d.ts for ${chalk.green('1.css')}`);
    expect(consoleLogSpy).toHaveBeenNthCalledWith(2, `Generated .d.ts for ${chalk.green('test/1.css')}`);
  });
});
