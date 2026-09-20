import react from '@abcp/config-eslint/react.js';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['node_modules/**', '.expo/**', 'babel.config.js', 'metro.config.js', 'tailwind.config.js'],
  },
  ...react,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
