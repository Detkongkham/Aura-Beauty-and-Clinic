import globals from 'globals';
import base from './base.js';

/** React/web flat config. */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
