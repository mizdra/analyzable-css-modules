import { resolve, relative } from 'path';
import * as process from 'process';
import * as util from 'util';
import { createCache } from '@file-cache/core';
import { createNpmPackageKey } from '@file-cache/npm';
import chalk from 'chalk';
import * as chokidar from 'chokidar';
import _glob from 'glob';
import { isGeneratedFilesExist, emitGeneratedFiles } from './emitter/index.js';
import { Loader } from './loader/index.js';
import type { Resolver } from './resolver/index.js';
import { createDefaultResolver } from './resolver/index.js';
import { createDefaultTransformer, type Transformer } from './transformer/index.js';
import { getInstalledPeerDependencies, isMatchByGlob } from './util.js';

const glob = util.promisify(_glob);

export type Watcher = {
  close: () => Promise<void>;
};

export type LocalsConvention = 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly' | undefined;

export interface RunnerOptions {
  pattern: string;
  outDir?: string | undefined;
  watch?: boolean | undefined;
  localsConvention?: LocalsConvention | undefined;
  declarationMap?: boolean | undefined;
  transformer?: Transformer | undefined;
  resolver?: Resolver | undefined;
  /**
   * The option compatible with sass's `--load-path`. It is an array of relative or absolute paths.
   * @example ['src/styles']
   * @example ['/home/user/repository/src/styles']
   */
  sassLoadPaths?: string[] | undefined;
  /**
   * The option compatible with less's `--include-path`. It is an array of relative or absolute paths.
   * @example ['src/styles']
   * @example ['/home/user/repository/src/styles']
   */
  lessIncludePaths?: string[] | undefined;
  /**
   * The option compatible with webpack's `resolve.alias`. It is an object consisting of a pair of alias names and relative or absolute paths.
   * @example { style: 'src/styles', '@': 'src' }
   * @example { style: '/home/user/repository/src/styles', '@': '/home/user/repository/src' }
   */
  webpackResolveAlias?: Record<string, string> | undefined;
  /**
   * The option compatible with postcss's `--config`. It is a relative or absolute path.
   * @example '.'
   * @example 'postcss.config.js'
   * @example '/home/user/repository/src'
   */
  postcssConfig?: string | undefined;
  /**
   * Only generate .d.ts and .d.ts.map for changed files.
   * @default true
   */
  cache?: boolean | undefined;
  /**
   * Strategy for the cache to use for detecting changed files.
   * @default 'content'
   */
  cacheStrategy?: 'content' | 'metadata' | undefined;
  /**
   * Silent output. Do not show "files written" messages.
   * @default false
   */
  silent?: boolean | undefined;
  /** Working directory path. */
  cwd?: string | undefined;
}

type OverrideProp<T, K extends keyof T, V extends T[K]> = Omit<T, K> & { [P in K]: V };

/**
 * Run typed-css-module.
 * @param options Runner options.
 * @returns Returns `Promise<Watcher>` if `options.watch` is `true`, `Promise<void>` if `false`.
 */
export async function run(options: OverrideProp<RunnerOptions, 'watch', true>): Promise<Watcher>;
export async function run(options: RunnerOptions): Promise<void>;
export async function run(options: RunnerOptions): Promise<Watcher | void> {
  const cwd = options.cwd ?? process.cwd();
  const silent = options.silent ?? false;
  const resolver =
    options.resolver ??
    createDefaultResolver({
      cwd,
      sassLoadPaths: options.sassLoadPaths,
      lessIncludePaths: options.lessIncludePaths,
      webpackResolveAlias: options.webpackResolveAlias,
    });
  const transformer = options.transformer ?? createDefaultTransformer({ cwd, postcssConfig: options.postcssConfig });
  const distOptions = options.outDir
    ? {
        rootDir: cwd, // TODO: support `--rootDir` option
        outDir: options.outDir,
      }
    : undefined;

  const installedPeerDependencies = await getInstalledPeerDependencies();
  const cache = await createCache({
    mode: options.cacheStrategy ?? 'content',
    keys: [
      () => createNpmPackageKey(['happy-css-modules', ...installedPeerDependencies]),
      () => {
        return JSON.stringify(options);
      },
    ],
    noCache: !(options.cache ?? true),
  });

  const loader = new Loader({ transformer, resolver });
  const isExternalFile = (filePath: string) => {
    return !isMatchByGlob(filePath, options.pattern, { cwd });
  };

  async function processFile(filePath: string) {
    try {
      const result = await loader.load(filePath);
      await emitGeneratedFiles({
        filePath,
        tokens: result.tokens,
        distOptions,
        emitDeclarationMap: options.declarationMap,
        dtsFormatOptions: {
          localsConvention: options.localsConvention,
        },
        isExternalFile,
      });
      if (!silent) console.log(`${chalk.green(relative(cwd, filePath))} (generated)`);
    } catch (error) {
      if (error instanceof Error) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        console.error(chalk.red('[Error] ' + error.stack));
      } else {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        console.error(chalk.red('[Error] ' + error));
      }
      throw error;
    }
  }

  async function isChangedFile(filePath: string) {
    const result = await cache.getAndUpdateCache(filePath);
    if (result.error) throw result.error;
    return result.changed;
  }

  if (options.watch) {
    if (!silent) console.log('Watch ' + options.pattern + '...');
    const watcher = chokidar.watch([options.pattern.replace(/\\/g, '/')], { cwd });
    watcher.on('all', (eventName, filePath) => {
      if (eventName === 'add' || eventName === 'change') {
        processFile(resolve(cwd, filePath)).catch(() => {
          // TODO: Emit a error by `Watcher#onerror`
        });
      }
    });
    return { close: async () => watcher.close() };
  } else {
    const filePaths = (await glob(options.pattern, { dot: true, cwd }))
      // convert relative path to absolute path
      .map((file) => resolve(cwd, file));

    const errors: unknown[] = [];
    for (const filePath of filePaths) {
      try {
        const _isGeneratedFilesExist = await isGeneratedFilesExist(filePath, distOptions, options.declarationMap);
        const _isChangedFile = await isChangedFile(filePath);
        // Generate .d.ts and .d.ts.map only when the file has been updated.
        // However, if .d.ts or .d.ts.map has not yet been generated, always generate.
        if (!_isGeneratedFilesExist || _isChangedFile) {
          await processFile(filePath);
        } else {
          if (!silent) console.log(chalk.gray(`${relative(cwd, filePath)} (skipped)`));
        }
      } catch (e: unknown) {
        errors.push(e);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to process files');
  }

  // Write cache state to file for persistence
  await cache.reconcile();
}
