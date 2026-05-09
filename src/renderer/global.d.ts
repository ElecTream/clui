// Asset module declarations.
//
// Kept in this dedicated file (no imports) so the declarations stay GLOBAL.
// env.d.ts has top-level imports which makes it a module — module-scoped
// `declare module '*.mp3'` doesn't apply to imports outside src/, which the
// notification audio asset import in sessionStore.ts hits.

declare module '*.mp3' {
  const src: string
  export default src
}

declare module '*.wav' {
  const src: string
  export default src
}
