import { decorateLanguageService, decorateLanguageServiceHost } from '@volar/typescript';
import { createLanguageServicePlugin } from '@volar/typescript/lib/quickstart/createLanguageServicePlugin';
import { getStylesPropertyAccessExpression } from './ast.cjs';
import { parseConfig } from './config.cjs';
import { createCssModulesLanguagePlugin } from './languagePlugin.cjs';
import { getCssFileName } from './source.cjs';
import { proxyLanguageServiceForCssModules } from './service.cjs';

export = createLanguageServicePlugin((ts, info) => {
  if (!info.project.fileExists(info.project.getProjectName())) {
    // project name not a tsconfig path, this is a inferred project
    return {
      languagePlugins: [],
    };
  }
  const config = parseConfig(info.config);

  const cssModulesLanguagePlugin = createCssModulesLanguagePlugin(info);

  return {
    languagePlugins: [cssModulesLanguagePlugin],
    setup: (language) => {
      decorateLanguageService(language, info.languageService);
      info.languageService = proxyLanguageServiceForCssModules(
        ts,
        language,
        info.languageService,
        config,
        (fileName) => fileName,
      );
      decorateLanguageServiceHost(ts, language, info.languageServiceHost);

      info.languageService.getRenameInfo;
      info.languageService.findRenameLocations;

      const getCompletionsAtPosition = info.languageService.getCompletionsAtPosition.bind(info.languageService);
      const getApplicableRefactors = info.languageService.getApplicableRefactors.bind(info.languageService);
      const getEditsForRefactor = info.languageService.getEditsForRefactor.bind(info.languageService);

      info.languageService.getCompletionsAtPosition = (...args) => {
        const prior = getCompletionsAtPosition(...args);

        const [fileName] = args;
        const cssModulesEntry = prior?.entries.find(
          (entry) =>
            entry.name === config.exportedStylesName && entry.data?.fileName === getCssFileName(fileName, config),
        );
        if (cssModulesEntry) {
          cssModulesEntry.sortText = '0';
        }
        return prior;
      };

      info.languageService.getApplicableRefactors = (...args) => {
        const prior = getApplicableRefactors(...args);

        const [fileName, positionOrRange] = args;
        const sourceFile = info.project.getSourceFile(info.project.projectService.toPath(fileName));
        if (!sourceFile) throw new Error('unreachable: sourceFile is undefined');
        const stylesNode = getStylesPropertyAccessExpression(sourceFile, positionOrRange, config);
        if (!stylesNode) return prior;

        prior.push({
          name: 'Define new css rule',
          description: 'Define new css rule',
          actions: [
            {
              name: 'Define new css rule',
              description: 'Define new css rule',
            },
          ],
        });

        return prior;
      };
      info.languageService.getEditsForRefactor = (...args) => {
        let prior = getEditsForRefactor(...args);

        const [fileName, , positionOrRange, refactorName, actionName] = args;
        if (refactorName !== 'Define new css rule' || actionName !== 'Define new css rule') return prior;

        prior = { edits: [] };
        const sourceFile = info.project.getSourceFile(info.project.projectService.toPath(fileName));
        if (!sourceFile) throw new Error('unreachable: sourceFile is undefined');
        const stylesNode = getStylesPropertyAccessExpression(sourceFile, positionOrRange, config);
        if (!stylesNode) throw new Error('unreachable: stylesNode is undefined');

        const className = stylesNode.name.getText();

        prior.edits.push({
          fileName: getCssFileName(fileName, config),
          textChanges: [
            {
              span: {
                start: 0,
                length: 0,
              },
              // TODO: Focus on CSS rule after insertion. But, that is technically feasible?
              newText: `.${className} {\n  \n}\n\n`,
            },
          ],
          // For some reason, adding a rule to an already existing file also requires `isNewFile: true`.
          isNewFile: true,
        });

        return prior;
      };
    },
  };
});
