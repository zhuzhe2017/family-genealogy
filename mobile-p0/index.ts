/**
 * Expo 入口
 *
 * 注意：Expo Web 在 Hermes transform engine 下不对 node_modules 做 JSX 转换，
 * 导致 react-native-web 等库残留 React.createElement 裸引用。
 * 解决：在入口注入 global.React，让所有裸引用都能 resolve 到。
 */
import React from 'react';
// @ts-ignore - 全局注入，解决第三方库 React.createElement 裸引用问题
if (typeof globalThis.React === 'undefined') {
  // @ts-ignore
  globalThis.React = React;
}

// 注册手势 handler （必须在 App 最顶部 import）
import 'react-native-gesture-handler';

export { default } from './App';
