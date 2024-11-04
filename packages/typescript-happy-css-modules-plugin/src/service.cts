import { Language } from '@volar/language-core';
import type * as ts from 'typescript';
import { Config } from './config.cjs';

const windowsPathReg = /\\/g;

export function proxyLanguageServiceForCssModules<T>(
  ts: typeof import('typescript'),
  language: Language<T>,
  languageService: ts.LanguageService,
  config: Config,
  asScriptId: (fileName: string) => T,
) {
  const proxyCache = new Map<string | symbol, Function | undefined>();

  const getProxyMethod = (target: ts.LanguageService, p: string | symbol): Function | undefined => {
    switch (p) {
      case 'getCodeFixesAtPosition':
        return getCodeFixesAtPosition(target[p]);
      case 'getQuickInfoAtPosition':
        return getQuickInfoAtPosition(ts, target, target[p]);
      // TS plugin only
      case 'getEncodedSemanticClassifications':
        return getEncodedSemanticClassifications(ts, language, target, asScriptId, target[p]);
    }
    return undefined;
  };

  return new Proxy(languageService, {
    get(target, p, receiver) {
      if (getProxyMethod) {
        if (!proxyCache.has(p)) {
          proxyCache.set(p, getProxyMethod(target, p));
        }
        const proxyMethod = proxyCache.get(p);
        if (proxyMethod) {
          return proxyMethod;
        }
      }
      return Reflect.get(target, p, receiver);
    },
    set(target, p, value, receiver) {
      return Reflect.set(target, p, value, receiver);
    },
  });
}

function getCodeFixesAtPosition(
  getCodeFixesAtPosition: ts.LanguageService['getCodeFixesAtPosition'],
): ts.LanguageService['getCodeFixesAtPosition'] {
  return (...args) => {
    let result = getCodeFixesAtPosition(...args);
    // filter __VLS_
    result = result.filter((entry) => entry.description.indexOf('__VLS_') === -1);
    return result;
  };
}

function getQuickInfoAtPosition(
  ts: typeof import('typescript'),
  languageService: ts.LanguageService,
  getQuickInfoAtPosition: ts.LanguageService['getQuickInfoAtPosition'],
): ts.LanguageService['getQuickInfoAtPosition'] {
  return (...args) => {
    const result = getQuickInfoAtPosition(...args);
    if (result && result.documentation?.length === 1 && result.documentation[0].text.startsWith('__VLS_emit,')) {
      const [_, emitVarName, eventName] = result.documentation[0].text.split(',');
      const program = languageService.getProgram()!;
      const typeChecker = program.getTypeChecker();
      const sourceFile = program.getSourceFile(args[0]);

      result.documentation = undefined;

      let symbolNode: ts.Identifier | undefined;

      sourceFile?.forEachChild(function visit(node) {
        if (ts.isIdentifier(node) && node.text === emitVarName) {
          symbolNode = node;
        }
        if (symbolNode) {
          return;
        }
        ts.forEachChild(node, visit);
      });

      if (symbolNode) {
        const emitSymbol = typeChecker.getSymbolAtLocation(symbolNode);
        if (emitSymbol) {
          const type = typeChecker.getTypeOfSymbolAtLocation(emitSymbol, symbolNode);
          const calls = type.getCallSignatures();
          for (const call of calls) {
            const callEventName = (
              typeChecker.getTypeOfSymbolAtLocation(call.parameters[0], symbolNode) as ts.StringLiteralType
            ).value;
            call.getJsDocTags();
            if (callEventName === eventName) {
              result.documentation = call.getDocumentationComment(typeChecker);
              result.tags = call.getJsDocTags();
            }
          }
        }
      }
    }
    return result;
  };
}

function getEncodedSemanticClassifications<T>(
  ts: typeof import('typescript'),
  language: Language<T>,
  languageService: ts.LanguageService,
  asScriptId: (fileName: string) => T,
  getEncodedSemanticClassifications: ts.LanguageService['getEncodedSemanticClassifications'],
): ts.LanguageService['getEncodedSemanticClassifications'] {
  return (filePath, span, format) => {
    const fileName = filePath.replace(windowsPathReg, '/');
    const result = getEncodedSemanticClassifications(fileName, span, format);
    const file = language.scripts.get(asScriptId(fileName));
    if (file?.generated?.root instanceof VueVirtualCode) {
      const { template } = file.generated.root.sfc;
      if (template) {
        for (const componentSpan of getComponentSpans.call(
          { typescript: ts, languageService },
          file.generated.root,
          template,
          {
            start: span.start - template.startTagEnd,
            length: span.length,
          },
        )) {
          result.spans.push(
            componentSpan.start + template.startTagEnd,
            componentSpan.length,
            256, // class
          );
        }
      }
    }
    return result;
  };
}

export function getComponentSpans(
  this: Pick<RequestContext, 'typescript' | 'languageService'>,
  vueCode: VueVirtualCode,
  template: NonNullable<VueVirtualCode['sfc']['template']>,
  spanTemplateRange: ts.TextSpan,
) {
  const { typescript: ts, languageService } = this;
  const result: ts.TextSpan[] = [];
  const validComponentNames = _getComponentNames(ts, languageService, vueCode);
  const components = new Set([...validComponentNames, ...validComponentNames.map(hyphenateTag)]);
  if (template.ast) {
    for (const node of forEachElementNode(template.ast)) {
      if (
        node.loc.end.offset <= spanTemplateRange.start ||
        node.loc.start.offset >= spanTemplateRange.start + spanTemplateRange.length
      ) {
        continue;
      }
      if (components.has(node.tag)) {
        let start = node.loc.start.offset;
        if (template.lang === 'html') {
          start += '<'.length;
        }
        result.push({
          start,
          length: node.tag.length,
        });
        if (template.lang === 'html' && !node.isSelfClosing) {
          result.push({
            start: node.loc.start.offset + node.loc.source.lastIndexOf(node.tag),
            length: node.tag.length,
          });
        }
      }
    }
  }
  return result;
}
