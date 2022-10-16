import { dirname, isAbsolute, relative } from 'path';
import { type Token } from '../loader/index.js';
import { type LocalsConvention } from '../runner.js';
import { exists } from '../util.js';
import { generateDtsContentWithSourceMap, getDtsFilePath } from './dts.js';
import { writeFileIfChanged } from './file-system.js';
import { generateSourceMappingURLComment, getSourceMapFilePath } from './source-map.js';

export function getRelativePath(fromFilePath: string, toFilePath: string): string {
  const resolved = relative(dirname(fromFilePath), toFilePath);
  if (resolved.startsWith('..')) {
    return resolved;
  } else {
    return './' + resolved;
  }
}

export function isSubDirectoryFile(fromDirectory: string, toFilePath: string): boolean {
  return isAbsolute(toFilePath) && toFilePath.startsWith(fromDirectory);
}

/** The distribution option. */
export type DistOptions = {
  /** Root directory. It is absolute. */
  rootDir: string;
  /** The path to the output directory. It is absolute. */
  outDir: string;
};

export type DtsFormatOptions = {
  localsConvention?: LocalsConvention;
};

/** The options for emitter. */
export type EmitterOptions = {
  /** The path to the source file (i.e. `/dir/foo.css`). It is absolute. */
  filePath: string;
  /** The tokens exported by the source file. */
  tokens: Token[];
  /** The distribution option. */
  distOptions: DistOptions | undefined;
  /** Whether to output declaration map (i.e. `/dir/foo.css.d.ts.map`) or not. */
  emitDeclarationMap: boolean | undefined;
  /** The options for formatting the type definition. */
  dtsFormatOptions: DtsFormatOptions | undefined;
  /** Whether the file is from an external library or not. */
  isExternalFile: (filePath: string) => boolean;
};

export async function emitGeneratedFiles({
  filePath,
  tokens,
  distOptions,
  emitDeclarationMap,
  dtsFormatOptions,
  isExternalFile,
}: EmitterOptions): Promise<void> {
  const dtsFilePath = getDtsFilePath(filePath, distOptions);
  const sourceMapFilePath = getSourceMapFilePath(filePath, distOptions);
  const { dtsContent, sourceMap } = generateDtsContentWithSourceMap(
    filePath,
    dtsFilePath,
    sourceMapFilePath,
    tokens,
    dtsFormatOptions,
    isExternalFile,
  );

  if (emitDeclarationMap) {
    const sourceMappingURLComment = generateSourceMappingURLComment(dtsFilePath, sourceMapFilePath);
    await writeFileIfChanged(dtsFilePath, dtsContent + sourceMappingURLComment);
    // NOTE: tsserver does not support inline declaration maps. Therefore, sourcemap files must be output.
    // blocked by: https://github.com/microsoft/TypeScript/issues/38966
    await writeFileIfChanged(sourceMapFilePath, sourceMap.toString());
  } else {
    await writeFileIfChanged(dtsFilePath, dtsContent);
  }
}

/**
 * Returns true if .d.ts (and .d.ts.map) files are generated for the given file.
 */
export async function isGeneratedFilesExist(
  filePath: string,
  distOptions: DistOptions | undefined,
  emitDeclarationMap: boolean | undefined,
): Promise<boolean> {
  const dtsFilePath = getDtsFilePath(filePath, distOptions);
  const sourceMapFilePath = getSourceMapFilePath(filePath, distOptions);
  if (emitDeclarationMap && !(await exists(sourceMapFilePath))) {
    return false;
  }
  if (!(await exists(dtsFilePath))) {
    return false;
  }
  return true;
}
