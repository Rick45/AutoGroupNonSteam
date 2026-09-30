import json
import os
from typing import Any

import decky


class Plugin:
    _settings_file = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")

    def _read_settings(self) -> dict[str, bool]:
        defaults = {"automatic_sync": True}
        try:
            with open(self._settings_file, "r", encoding="utf-8") as settings_file:
                data = json.load(settings_file)
            if isinstance(data, dict) and isinstance(data.get("automatic_sync"), bool):
                return {"automatic_sync": data["automatic_sync"]}
        except FileNotFoundError:
            pass
        except (OSError, ValueError, TypeError) as error:
            decky.logger.warning("Could not read settings; using defaults: %s", error)
        return defaults

    def _write_settings(self, settings: dict[str, bool]) -> None:
        os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
        temporary_file = f"{self._settings_file}.tmp"
        with open(temporary_file, "w", encoding="utf-8") as settings_file:
            json.dump(settings, settings_file, indent=2)
            settings_file.write("\n")
        os.replace(temporary_file, self._settings_file)

    async def get_settings(self) -> dict[str, bool]:
        return self._read_settings()

    async def set_automatic_sync(self, enabled: bool) -> dict[str, bool]:
        settings = {"automatic_sync": bool(enabled)}
        self._write_settings(settings)
        decky.logger.info("Automatic synchronization set to %s", settings["automatic_sync"])
        return settings

    async def write_log(self, level: str, message: Any) -> None:
        log_method = {
            "debug": decky.logger.debug,
            "info": decky.logger.info,
            "warning": decky.logger.warning,
            "error": decky.logger.error,
        }.get(level, decky.logger.info)
        log_method("%s", str(message))

    async def _main(self) -> None:
        decky.logger.info("Non-Steam Collection backend started")

    async def _unload(self) -> None:
        decky.logger.info("Non-Steam Collection backend stopped")
