import type { CodeMapping, LanguagePlugin, VirtualCode } from '@volar/language-core';
import type ts from 'typescript/lib/tsserverlibrary';

export function createCssModulesLanguagePlugin(
  info: ts.server.PluginCreateInfo,
): LanguagePlugin<string, CssModulesCode> {
  return {
    getLanguageId(scriptId) {
      if (isCssModulesFile(scriptId)) {
        return 'cssmodules';
      }
      return undefined;
    },
    createVirtualCode(scriptId, languageId, snapshot) {
      if (languageId !== 'cssmodules') return undefined;
      return new CssModulesCode(snapshot);
    },
    updateVirtualCode(scriptId, languageCode, snapshot) {
      languageCode.update(snapshot);
      return languageCode;
    },
    typescript: {
      extraFileExtensions: [
        {
          extension: 'module.css',
          isMixedContent: true,
          scriptKind: 7,
        },
      ],
      getServiceScript(virtualCode) {
        return {
          code: virtualCode,
          extension: '.ts',
          scriptKind: 3,
        };
      },
    },
  };
}

export class CssModulesCode implements VirtualCode {
  id = 'root';
  languageId = 'cssmodules';
  embeddedCodes: VirtualCode[] = [];
  mappings: CodeMapping[] = [];

  constructor(public snapshot: ts.IScriptSnapshot) {
    this.onSnapshotUpdated();
  }

  public update(newSnapshot: ts.IScriptSnapshot) {
    this.snapshot = newSnapshot;
    this.onSnapshotUpdated();
  }

  public onSnapshotUpdated() {
    const snapshotContent = this.snapshot.getText(0, this.snapshot.getLength());

    this.embeddedCodes = [
      {
        id: this.id + ':css',
        languageId: 'css',
        mappings: [],
        snapshot: {
          getText: (start, end) => snapshotContent.substring(start, end),
          getLength: () => snapshotContent.length,
          getChangeRange: () => undefined,
        },
      },
    ];
  }
}

function isCssModulesFile(fileName: string): boolean {
  return fileName.endsWith('.module.css') || fileName.endsWith('.module.css.d.ts');
}

function getCssModulesText() {
  return `
declare const styles: {};
export default styles;
  `.trim();
}
