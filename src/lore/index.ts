// Public surface of the Lore module. Lore is a first-class VCS in ugit, separate from the
// git side (GitAdapter). See docs/lore-support-todo.md for the design.

export * from './types';
export * from './loreProcess';
export * from './loreParsers';
export {
  LoreClient,
  createLoreRepository,
  cloneLoreRepository,
  cloneLoreRepositoryStreaming,
  loreLogin,
  loreAuthList,
  writeTempViewFile,
} from './LoreClient';
export type { LoreClientOptions, LoreCommandStateCallback } from './LoreClient';
export { resolveLoreBin } from './resolveLoreBin';
