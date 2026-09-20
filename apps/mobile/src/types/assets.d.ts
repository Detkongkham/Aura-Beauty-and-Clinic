/** Static image asset imports — Metro resolves these to an opaque asset id (number). */
declare module '*.png' {
  const value: number;
  export default value;
}

declare module '*.jpg' {
  const value: number;
  export default value;
}
