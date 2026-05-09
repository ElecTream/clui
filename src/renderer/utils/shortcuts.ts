// Platform-aware shortcut label helpers for the renderer.
// Resolves at module load — there's no Electron API here, just the browser navigator.

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
export const IS_WIN =
  typeof navigator !== 'undefined' && /Win/.test(navigator.platform)

/** Primary modifier rendered for the current OS: ⌘ on macOS, Ctrl on Windows/Linux. */
export const CMD = IS_MAC ? '⌘' : 'Ctrl'
/** Alt key glyph: ⌥ on macOS, Alt on Windows/Linux. */
export const ALT = IS_MAC ? '⌥' : 'Alt'
/** Shift glyph: ⇧ on macOS, Shift on Windows/Linux. */
export const SHIFT = IS_MAC ? '⇧' : 'Shift'

/** Format a shortcut like ('Shift', 'C') → "⌘⇧C" on Mac, "Ctrl+Shift+C" on Windows. */
export function shortcut(...parts: string[]): string {
  const mods: string[] = [CMD]
  let key = ''
  for (const p of parts) {
    if (p === 'Shift') mods.push(SHIFT)
    else if (p === 'Alt' || p === 'Option') mods.push(ALT)
    else key = p
  }
  return IS_MAC ? `${mods.join('')}${key}` : `${mods.join('+')}+${key}`
}

/** The global summon hotkey label, in user-readable form. */
export const SUMMON_SHORTCUT = IS_MAC ? '⌥ + Space' : 'Ctrl + Alt + C'
