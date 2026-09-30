// Metro 配置 —— 干净版
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 让 Metro 支持 .wasm 作为静态资源（CanvasKit）
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'wasm'];

module.exports = config;
