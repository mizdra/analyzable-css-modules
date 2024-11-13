import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FileImporter } from 'sass';
import type { StrictlyResolver } from '../locator/index.js';
import type { Transformer } from './index.js';
import { handleImportError } from './index.js';

const createFileImporter: (resolver: StrictlyResolver) => FileImporter<'async'> = (resolver) => ({
  async findFileUrl(url, context): Promise<URL> {
    const path = await resolver(url, { request: fileURLToPath(context.containingUrl!) });
    return pathToFileURL(path);
  },
});

export const createScssTransformer: () => Transformer = () => {
  let sass: typeof import('sass');
  return async (source, options) => {
    // eslint-disable-next-line require-atomic-updates
    sass ??= await import('sass').catch(handleImportError('sass'));
    const result = await sass.compileStringAsync(source, {
      url: pathToFileURL(options.from),
      sourceMap: true,
      importers: [createFileImporter(options.resolver)],
    });
    return { css: result.css.toString(), map: JSON.stringify(result.sourceMap!), dependencies: result.loadedUrls };
  };
};
