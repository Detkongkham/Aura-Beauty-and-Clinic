import globals from 'globals';
import base from './base.js';

/** Node/backend flat config. */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
