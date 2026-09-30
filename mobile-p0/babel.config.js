/**
 * Babel 配置 —— Expo 52 + Skia Web 兼容
 *
 * 核心问题：Expo SDK 52 的 Metro/Hermes 不转译 node_modules 的 JSX，
 * react-native-web、@shopify/react-native-skia 的 Web 实现里残留
 * React.createElement 裸引用 → 浏览器报 "React is not defined"。
 *
 * 解法：自定义 Babel 插件，**对每个被转译的文件**（包括最终 bundle 里
 * 所有模块的 factory function）注入 `var React = require('react')`，
 * 让裸 React 引用 resolve 到正确的 React 模块。
 */

function injectReactPlugin(babel) {
  const { types: t } = babel;
  return {
    name: 'inject-react',
    visitor: {
      // 在 Program 顶层注入 var React = require('react')
      Program(path, state) {
        // 只在 bundle 里做（dev/prod 都做），但跳过已经 import/require React 的文件
        const hasReactImport = path.node.body.some(
          (node) =>
            t.isImportDeclaration(node) &&
            node.source.value === 'react' &&
            node.specifiers.some((s) => t.isImportDefaultSpecifier(s)),
        );
        const hasReactRequire = path.node.body.some(
          (node) =>
            t.isVariableDeclaration(node) &&
            node.declarations.some(
              (d) =>
                t.isCallExpression(d.init) &&
                t.isIdentifier(d.init.callee, { name: 'require' }) &&
                d.init.arguments.some((a) => t.isStringLiteral(a, { value: 'react' })),
            ),
        );
        if (!hasReactImport && !hasReactRequire) {
          // 在最前面插入 var React = require('react');
          const inject = t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier('React'),
              t.callExpression(t.identifier('require'), [t.stringLiteral('react')]),
            ),
          ]);
          path.unshiftContainer('body', inject);
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [injectReactPlugin],
  };
};
