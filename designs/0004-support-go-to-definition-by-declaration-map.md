- Feature Name: Support go to definition by Declaration Map
- Start Date: 2024-06-01
- RFC PR: [#0](https://github.com/mizdra/happy-css-modules/pull/0)

# Summary

"Go to definition" をサポートするための戦略を提案する RFC です。

# Motivation

CSS Modules は、CSS をモジュール化して構成するための仕組みです。スタイルは `.module.css` に記述され、`.js` から `.module.css` をインポートして利用します。

しかし、`.js` と `.module.css` は異なる言語で記述されているため、エディタの言語機能を利用することが難しいです。例えば、`.js` 内の `styles.foo` から、"Go to definition" を用いて、`.module.css` へとジャンプできません。

そこで、この RFC では、CSS Modules で "Go to definition" をサポートするための戦略を提案します。

# Detailed design

"Go to definition" をサポートするには、いくつかの方法が考えられます。

1. エディタ拡張機能を利用する
   - e.g.: VS Code extension, Vim plugin, Emacs plugin
2. [TypeScript Language Service Plugin](https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin) を利用する
   - この技術を用いると、Language Server の挙動をカスタマイズできます
3. [Declaration Map](https://www.typescriptlang.org/tsconfig/#declarationMap) を利用する

1 は最もシンプルな解決方法ですが、エディタごとに拡張機能を用意する必要があります。また、エディタ拡張機能の開発は、エディタごとに異なるため、開発コストが高くなります。

## Compatibility with PostCSS/Sass/Less

# Drawbacks

# Alternatives

## TypeScript Language Service Plugin

TypeScript Language Service Plugin を用いると、Declaration Map と同じように Go to definition をサポートできます。

# Prior art

# Unresolved questions

# Future possibilities
