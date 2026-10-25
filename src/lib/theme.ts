export const THEME_KEY = 'rs24-theme';

/** Runs before paint (inline in <head>) so a user-forced theme never flashes. */
export const themeBootScript =
  `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

/** Persist + apply a theme choice ('system' follows prefers-color-scheme). */
export function applyTheme(choice: 'system' | 'light' | 'dark') {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {}
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}
