/** CSS files are bundled as text modules by scripts/build.mjs. */
declare module '*.css' {
  const text: string;
  export default text;
}
