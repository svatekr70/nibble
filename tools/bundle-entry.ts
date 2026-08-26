// Jeden balík pro měření velikosti. Typy se nereexportují, aby se nesrazily
// s těmi z jádra — `@nibble/ui` je jen vykresluje.
export * from '@nibble/core';
export { attachToolbar, Toolbar, ContextToolbar, openDialog, iconSvg } from '@nibble/ui';
export {
  link, image, table, media, emoji, charmap, code, autolink, wordcount,
  fullscreen, searchreplace, typography, fonts, createImagePlugin,
  createTablePlugin, createMediaPlugin, createFontPlugin, createEmojiPlugin,
  createCharmapPlugin,
} from '@nibble/plugins';
