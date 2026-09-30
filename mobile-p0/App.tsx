/**
 * App 入口 —— 家谱树 Skia Spike
 *
 * Expo Web 端：Skia Web 需要 CanvasKit WASM 初始化才能使用。
 * WithSkiaWeb 是 @shopify/react-native-skia 提供的 Suspense wrapper，
 * 会在 Skia WASM 加载完成后再渲染子组件。
 *
 * Native 端（iOS/Android）：Skia 原生代码直接可用，
 *   WithSkiaWeb 会跳过 WASM 加载直接渲染。
 */
import React from 'react';
import 'react-native-gesture-handler';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { TreeScreen } from './src/screens/TreeScreen';

// fallback：Skia WASM 加载过程中显示
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
