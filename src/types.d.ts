declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

interface SteamAppOverview {
  appid: number;
  BIsShortcut(): boolean;
}

interface SteamCollection {
  id: string;
  displayName: string;
  bIsDynamic: boolean;
  allApps: SteamAppOverview[];
  internalAddedList: Set<number>;
  internalRemovedList: Set<number>;
  Save(): Promise<void>;
  AsDeletableCollection(): { Delete(): Promise<void> } | null;
}

interface SteamWindow {
  appStore?: {
    m_bIsInitialized: boolean;
    allApps: SteamAppOverview[];
    GetAppOverviewByAppID(appId: number): SteamAppOverview | null;
  };
  collectionStore?: {
    collectionsFromStorage?: Map<string, SteamCollection>;
    GetUserCollectionsByName(name: string): SteamCollection[];
    NewUnsavedCollection(
      name: string,
      filter: undefined,
      apps: SteamAppOverview[],
    ): SteamCollection;
  };
}
