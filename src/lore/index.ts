// Public surface of the Lore module. Lore is a first-class VCS in ugit, separate from the
// git side (GitAdapter). See docs/lore-support-todo.md for the design.

export * from './types';
export * from './loreProcess';
export * from './loreParsers';
export * from './conflictParser';
export * from './graphLayout';
export * from './loreStash';
export {
  LoreClient,
  createLoreRepository,
  cloneLoreRepository,
  cloneLoreRepositoryStreaming,
  loreLogin,
  loreAuthList,
  loreAuthInfo,
  writeTempViewFile,
} from './LoreClient';
export type { LoreClientOptions, LoreCommandStateCallback } from './LoreClient';
export { resolveLoreBin } from './resolveLoreBin';
