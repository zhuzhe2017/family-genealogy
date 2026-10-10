/**
 * App 入口（Web 端）—— 家谱树 Skia Spike
 *
 * Skia Web 需要先加载 CanvasKit WASM 才能使用。
 * WithSkiaWeb 是 @shopify/react-native-skia 提供的 Suspense wrapper，
 * 会在 WASM 加载完成后再渲染子组件。
 *
 * 原生端入口见 App.tsx —— 那边不能引入这个 web 入口，
 * 否则 canvaskit-wasm 会被打进原生 bundle 并因 require('fs') 而打包失败。
 */
import React from 'react';
import 'react-native-gesture-handler';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { TreeScreen } from './src/screens/TreeScreen';

// Skia WASM 加载过程中显示（保持空白，避免闪烁）
function SkiaLoading() {
  return null;
}

// 真正的 App 组件（Skia WASM 加载完后才渲染）
function AppInner() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <TreeScreen />
    </SafeAreaView>
  );
}

// WithSkiaWeb 的 getComponent 需要返回一个 React 组件
// （注意：不能直接传 JSX，必须传组件类型）
function App() {
  return (
    <WithSkiaWeb
      getComponent={() => Promise.resolve({ default: AppInner })}
      fallback={<SkiaLoading />}
      opts={{ locateFile: () => 'https://unpkg.com/canvaskit-wasm@0.39.1/bin/full/canvaskit.wasm' }}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0E9DD',
  },
});

export default App;
registerRootComponent(App);
