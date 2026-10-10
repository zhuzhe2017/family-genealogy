/**
 * App 入口（原生端：iOS / Android）—— 家谱树 Skia Spike
 *
 * 原生端 Skia 原生代码直接可用，不需要 CanvasKit WASM，
 * 也不能引入 @shopify/react-native-skia 的 web 入口
 * （它会 require canvaskit-wasm，内部有 require('fs')，原生打包会失败）。
 *
 * Web 端入口见 App.web.tsx。
 */
import React from 'react';
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { TreeScreen } from './src/screens/TreeScreen';

function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <TreeScreen />
    </SafeAreaView>
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
