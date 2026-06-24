// Public surface of the Lore module. Lore is a first-class VCS in ugit, separate from the
// git side (GitAdapter). See docs/lore.md for usage.

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
  listRemoteRepositories,
  loreLogin,
  loreAuthList,
  loreAuthInfo,
  writeTempViewFile,
  sharedStoreCreate,
  sharedStoreInfo,
  sharedStoreSetUseAutomatically,
} from './LoreClient';
export type { LoreClientOptions, LoreCommandStateCallback } from './LoreClient';
export { resolveLoreBin, setLoreBinOverride, resolveLoreServerBin, setLoreServerOverride } from './resolveLoreBin';
