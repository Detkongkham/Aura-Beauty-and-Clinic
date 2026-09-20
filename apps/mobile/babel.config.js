module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo ໃສ່ react-native-reanimated/plugin ໃຫ້ອັດຕະໂນມັດ (SDK 50+).
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
