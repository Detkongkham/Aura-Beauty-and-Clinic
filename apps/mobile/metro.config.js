// Metro config — Expo + NativeWind + pnpm monorepo (node-linker=hoisted).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// ໃຫ້ Metro ເຝົ້າເບິ່ງ workspace root + resolve ຈາກທັງ 2 node_modules.
// (ບໍ່ຕັ້ງ disableHierarchicalLookup — pnpm hoisted ຕ້ອງການ walk-up.)
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
