import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk?version=4.0";
import Adw from "gi://Adw?version=1";

import { settings } from "./util.js";

export class SyncPreferencesDialog extends Adw.PreferencesDialog {
  static {
    GObject.registerClass(
      {
        GTypeName: "SyncPreferencesDialog",
      },
      this,
    );
  }

  constructor() {
    super();

    const page = new Adw.PreferencesPage({
      title: _("Sync Preferences"),
      icon_name: "network-transmit-receive-symbolic",
    });

    const group = new Adw.PreferencesGroup({
      title: _("Note Sync"),
      description: _("Sync your notes with a remote PostgREST server"),
    });

    const enabled_row = new Adw.SwitchRow({
      title: _("Enable sync"),
      subtitle: _("Send and receive notes from the configured server"),
    });
    settings.bind(
      "sync-enabled",
      enabled_row,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    group.add(enabled_row);

    const url_row = new Adw.EntryRow({
      title: _("Server URL"),
    });
    settings.bind(
      "sync-url",
      url_row,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );
    group.add(url_row);

    const key_row = new Adw.PasswordEntryRow({
      title: _("API key"),
    });
    settings.bind(
      "sync-api-key",
      key_row,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );
    group.add(key_row);

    const interval_row = new Adw.SpinRow({
      title: _("Retry interval (seconds)"),
      subtitle: _("How often to retry when offline"),
      adjustment: new Gtk.Adjustment({
        lower: 10,
        upper: 3600,
        step_increment: 10,
        page_increment: 60,
        value: settings.get_int("sync-interval-seconds"),
      }),
    });
    settings.bind(
      "sync-interval-seconds",
      interval_row,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    group.add(interval_row);

    page.add(group);
    this.add(page);
  }
}
