import node from '@abcp/config-eslint/node.js';

export default [
  ...node,
  { ignores: ['src/generated/**', 'prisma/migrations/**'] },
];
