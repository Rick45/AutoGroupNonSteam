import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  ToggleField,
  staticClasses,
} from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { FaLayerGroup } from "react-icons/fa";

const COLLECTION_NAME = "Non-Steam Games";
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

interface Settings {
  automatic_sync: boolean;
}

interface SyncState {
  automaticSync: boolean;
  detected: number;
  inCollection: number;
  syncing: boolean;
  status: string;
}

const getSettings = callable<[], Settings>("get_settings");
const setAutomaticSync = callable<[enabled: boolean], Settings>("set_automatic_sync");
const writeLog = callable<[level: string, message: string], void>("write_log");

class SyncService {
  private state: SyncState = {
    automaticSync: true,
    detected: 0,
    inCollection: 0,
    syncing: false,
    status: "Starting…",
  };
  private readonly listeners = new Set<() => void>();
  private interval: ReturnType<typeof setInterval> | undefined;
  private retryTimeout: ReturnType<typeof setTimeout> | undefined;
  private currentSync: Promise<void> | undefined;
  private stopped = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  private update(change: Partial<SyncState>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener());
  }

  private log(level: "debug" | "info" | "warning" | "error", message: string) {
    const output = `[Non-Steam Collection] ${message}`;
    level === "error" ? console.error(output) : console.log(output);
    void writeLog(level, message).catch(() => undefined);
  }

  async start() {
    this.stopped = false;
    try {
      const settings = await getSettings();
      this.update({ automaticSync: settings.automatic_sync });
    } catch (error) {
      this.log("warning", `Could not load settings; using automatic sync: ${String(error)}`);
    }

    if (this.state.automaticSync) {
      await this.sync("startup");
      this.schedule();
    } else {
      this.update({ status: "Automatic synchronization is off" });
    }
  }

  stop() {
    this.stopped = true;
    if (this.interval !== undefined) clearInterval(this.interval);
    if (this.retryTimeout !== undefined) clearTimeout(this.retryTimeout);
    this.interval = undefined;
    this.retryTimeout = undefined;
  }

  private schedule() {
    if (this.interval !== undefined) clearInterval(this.interval);
    if (this.stopped || !this.state.automaticSync) return;
    this.interval = setInterval(() => void this.sync("scheduled"), SYNC_INTERVAL_MS);
  }

  async setAutomatic(enabled: boolean) {
    try {
      const settings = await setAutomaticSync(enabled);
      this.update({ automaticSync: settings.automatic_sync });
      if (settings.automatic_sync) {
        await this.sync("enabled");
        this.schedule();
      } else {
        if (this.interval !== undefined) clearInterval(this.interval);
        if (this.retryTimeout !== undefined) clearTimeout(this.retryTimeout);
        this.interval = undefined;
        this.retryTimeout = undefined;
        this.update({ status: "Automatic synchronization is off" });
      }
    } catch (error) {
      this.log("error", `Could not save automatic-sync setting: ${String(error)}`);
      this.update({ status: "Could not save setting" });
      toaster.toast({ title: "Non-Steam Collection", body: "Could not save the setting." });
    }
  }

  sync(trigger: string): Promise<void> {
    if (this.currentSync) return this.currentSync;
    this.currentSync = this.performSync(trigger).finally(() => {
      this.currentSync = undefined;
    });
    return this.currentSync;
  }

  private async performSync(trigger: string) {
    this.update({ syncing: true, status: "Synchronizing…" });
    try {
      const steamWindow = window as unknown as SteamWindow;
      const appStore = steamWindow.appStore;
      const apps = appStore?.allApps;
      const store = steamWindow.collectionStore;
      if (
        appStore?.m_bIsInitialized !== true ||
        !Array.isArray(apps) ||
        !store?.collectionsFromStorage ||
        !store.GetUserCollectionsByName ||
        !store.NewUnsavedCollection
      ) {
        throw new Error("Steam library APIs are not ready");
      }

      const shortcuts: SteamAppOverview[] = [];
      const uncertainIds = new Set<number>();
      for (const app of apps) {
        try {
          if (app.BIsShortcut()) shortcuts.push(app);
        } catch (error) {
          uncertainIds.add(app.appid);
          this.log("warning", `Could not classify app ${app.appid}: ${String(error)}`);
        }
      }

      const matches = store.GetUserCollectionsByName(COLLECTION_NAME);
      const staticMatches = matches.filter((collection) => !collection.bIsDynamic);
      let collection: SteamCollection;
      let added = 0;
      let removed = 0;
      let created = false;
      const warnings: string[] = [];

      if (staticMatches.length === 0) {
        collection = store.NewUnsavedCollection(COLLECTION_NAME, undefined, shortcuts);
        await collection.Save();
        created = true;
        added = shortcuts.length;
      } else {
        collection = [...staticMatches].sort((left, right) => left.id.localeCompare(right.id))[0];
        const previous = new Set(collection.internalAddedList);
        const desired = new Set(shortcuts.map((app) => app.appid));
        for (const id of previous) {
          if (uncertainIds.has(id)) desired.add(id);
        }

        added = [...desired].filter((id) => !previous.has(id)).length;
        removed = [...previous].filter((id) => !desired.has(id)).length;
        const changed = added > 0 || removed > 0 || collection.internalRemovedList.size > 0;
        if (changed) {
          collection.internalAddedList.clear();
          desired.forEach((id) => collection.internalAddedList.add(id));
          collection.internalRemovedList.clear();
          await collection.Save();
        }

        for (const duplicate of matches) {
          if (duplicate.id === collection.id) continue;
          try {
            await duplicate.AsDeletableCollection()?.Delete();
          } catch (error) {
            warnings.push(duplicate.id);
            this.log("warning", `Could not delete duplicate collection ${duplicate.id}: ${String(error)}`);
          }
        }
      }

      const inCollection = collection.allApps.length;
      const status = warnings.length > 0 ? "Synchronized with warnings" : "Synchronized";
      this.update({ detected: shortcuts.length, inCollection, status });
      this.log(
        "info",
        `${trigger} sync complete: detected=${shortcuts.length}, in_collection=${inCollection}, ` +
          `added=${added}, removed=${removed}, created=${created}, duplicate_failures=${warnings.length}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.update({ status: `Sync failed: ${message}` });
      this.log("error", `${trigger} sync failed: ${message}`);
      if (
        message === "Steam library APIs are not ready" &&
        this.state.automaticSync &&
        !this.stopped
      ) {
        if (this.retryTimeout !== undefined) clearTimeout(this.retryTimeout);
        this.retryTimeout = setTimeout(() => {
          this.retryTimeout = undefined;
          void this.sync("readiness retry");
        }, 10_000);
      }
      if (trigger === "manual") {
        toaster.toast({ title: "Non-Steam Collection", body: `Sync failed: ${message}` });
      }
    } finally {
      this.update({ syncing: false });
    }
  }
}

function Content({ service }: { service: SyncService }) {
  const [state, setState] = useState(service.getSnapshot());

  useEffect(() => service.subscribe(() => setState(service.getSnapshot())), [service]);

  return (
    <PanelSection title="Non-Steam Collection">
      <PanelSectionRow>Collection: {COLLECTION_NAME}</PanelSectionRow>
      <PanelSectionRow>Games detected: {state.detected}</PanelSectionRow>
      <PanelSectionRow>Games in collection: {state.inCollection}</PanelSectionRow>
      <PanelSectionRow>{state.status}</PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={state.syncing} onClick={() => void service.sync("manual")}>
          {state.syncing ? "Syncing…" : "Sync Now"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label="Automatic synchronization"
          checked={state.automaticSync}
          disabled={state.syncing}
          onChange={(enabled) => void service.setAutomatic(enabled)}
        />
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  const service = new SyncService();
  void service.start();

  return {
    name: "Non-Steam Collection",
    titleView: <div className={staticClasses.Title}>Non-Steam Collection</div>,
    content: <Content service={service} />,
    icon: <FaLayerGroup />,
    onDismount() {
      service.stop();
    },
  };
});
