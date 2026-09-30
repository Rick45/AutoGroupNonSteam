# Non-Steam Collection

A small Decky Loader plugin that maintains a Steam collection named **Non-Steam Games**. The collection contains all shortcuts that Steam identifies as non-Steam games and no normal Steam titles.

## Behavior

- Synchronizes when the plugin loads and every five minutes while automatic synchronization is enabled.
- Adds newly created non-Steam shortcuts and removes deleted shortcuts.
- Removes normal Steam games manually placed in the managed collection.
- Reuses one static collection and consolidates duplicate collections with the same name.
- Never creates, edits, or deletes the shortcuts themselves.

Use **Sync Now** in Decky's Quick Access menu for an immediate update. The automatic-sync setting is enabled by default and persists across restarts.

## Build

Install Node.js 16.14 or newer and pnpm 9, then run:

```bash
pnpm install --frozen-lockfile
pnpm build
```

The Rollup build writes the frontend bundle to `dist/index.js`.

## Install from ZIP on Steam Deck

Download `Non-Steam-Collection.zip` from the
[latest GitHub release](https://github.com/Rick45/AutoGroupNonSteam/releases/latest),
or use a locally packaged ZIP from `out/`:

```text
https://github.com/Rick45/AutoGroupNonSteam/releases/latest/download/Non-Steam-Collection.zip
```

1. Open Decky Loader settings from the Quick Access menu.
2. Enable **Developer mode**.
3. Open the **Developer** section and choose **Install Plugin from ZIP File**.
4. Browse to the ZIP, select it, and confirm the installation.
5. Open **Non-Steam Collection** from the Decky plugin list and press **Sync Now**.

If the plugin does not appear immediately, restart Steam or restart `plugin_loader`.

## Publishing a Release

Releases are created only on demand. In GitHub, open **Actions**, select
**Publish plugin release**, choose **Run workflow**, and select a patch, minor,
or major version increment. The workflow updates `package.json`, builds and
validates the plugin, commits the new version, creates the matching `vX.Y.Z`
tag, and publishes `Non-Steam-Collection.zip` in a GitHub Release.

### Manual development install

After building on the Deck, create the plugin directory and copy the runtime files:

```bash
plugin_dir="$HOME/homebrew/plugins/Non-Steam Collection"
mkdir -p "$plugin_dir"
cp -r dist assets defaults "$plugin_dir/"
cp main.py package.json plugin.json LICENSE "$plugin_dir/"
sudo systemctl restart plugin_loader
```

Open the Quick Access menu (`…`), select the Decky plug icon, then open **Non-Steam Collection**. Press **Sync Now** and confirm that **Non-Steam Games** appears under Library → Collections.

To update a development installation, rebuild, repeat the copy commands, and restart `plugin_loader`.

## Testing Checklist

1. Run sync twice and confirm only one collection exists and counts remain unchanged.
2. Add a non-Steam shortcut, sync, and confirm it appears.
3. Remove that shortcut, sync, and confirm its collection entry disappears.
4. Add a normal Steam game to the collection, sync, and confirm it is removed only from the collection.
5. Disable automatic synchronization, restart Decky, and confirm the toggle remains disabled while **Sync Now** still works.

## Troubleshooting

Plugin activity and API failures are written to:

```text
~/homebrew/logs/Non-Steam Collection/plugin.log
```

Decky's general loader log is `/tmp/plugin_loader.log`. If the panel reports that Steam library APIs are not ready, wait until the Steam library finishes loading and press **Sync Now** again.
