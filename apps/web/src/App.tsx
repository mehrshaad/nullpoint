import { useEffect, useState } from "react";
import { noiseModeFromState, type NoiseMode } from "@ssc/core";
import { useHeadphones } from "./state/useHeadphones.js";
import { useSettings } from "./state/useSettings.js";
import { ConnectIdle } from "./screens/ConnectIdle.js";
import { Connecting } from "./screens/Connecting.js";
import { ConnectFailed } from "./screens/ConnectFailed.js";
import { UnsupportedBrowser } from "./screens/UnsupportedBrowser.js";
import { Dashboard } from "./screens/Dashboard.js";
import { Settings } from "./screens/Settings.js";

export function App() {
  const { settings, update, isDesktop } = useSettings();
  const { connection, deviceState, controlLost, connect, reconnectKnown, grantedPorts, reset, headphones } =
    useHeadphones({ autoReconnect: settings.reconnectAutomatically });
  const [showSettings, setShowSettings] = useState(false);

  // Global shortcuts arrive from the desktop shell, which owns the keys but not the connection.
  // Applied straight to the headset — the whole point is not having to open a window first.
  useEffect(() => {
    const bridge = window.nullpoint;
    if (!bridge?.onHotkey) return;
    return bridge.onHotkey((action) => {
      const hp = headphones;
      if (!hp?.state.ncAsm) return;
      if (action === "cycle") {
        const order: NoiseMode[] = ["anc", "ambient", "off"];
        const next = order[(order.indexOf(noiseModeFromState(hp.state.ncAsm)) + 1) % order.length]!;
        void hp.setNoiseMode(next);
        return;
      }
      if (action === "anc" || action === "ambient" || action === "off") {
        void hp.setNoiseMode(action);
      }
    });
  }, [headphones]);

  // Hold locked settings in place. Speak-to-Chat is reported switching itself back on, so when
  // it drifts from what was locked, write the intended value back. Guarded on the current value
  // so this can only ever fire on an actual change — never a loop against the headset.
  const lockedStc = settings.lockedSettings.speakToChat;
  const liveStc = deviceState?.speakToChat;
  useEffect(() => {
    if (lockedStc === undefined || !liveStc || !headphones) return;
    if (liveStc.enabled === lockedStc) return;
    void headphones.setSpeakToChat({ ...liveStc, enabled: lockedStc });
  }, [lockedStc, liveStc, headphones]);

  // Mirror the essentials to the tray, so the menu can show battery and the current mode and
  // change it without the window ever opening.
  const ncAsm = deviceState?.ncAsm;
  useEffect(() => {
    window.nullpoint?.reportDeviceState?.({
      model: deviceState?.modelName ?? null,
      battery: deviceState?.battery?.level ?? null,
      mode: ncAsm ? noiseModeFromState(ncAsm) : null,
    });
  }, [deviceState?.modelName, deviceState?.battery?.level, ncAsm]);

  // Remember what connected, so the reconnect button can carry a name. Granted ports have no
  // identity of their own, so this list is the only source for one.
  const model = deviceState?.modelName;
  useEffect(() => {
    if (!model || settings.knownDevices[0] === model) return;
    void update({
      knownDevices: [model, ...settings.knownDevices.filter((d) => d !== model)].slice(0, 4),
    });
  }, [model, settings.knownDevices, update]);

  if (showSettings) {
    return (
      <Settings
        settings={settings}
        update={update}
        isDesktop={isDesktop}
        deviceState={deviceState}
        headphones={headphones}
        // Back to the dashboard on the way out: Settings shows no connection state, so
        // powering the headphones off from here otherwise looks like nothing happened.
        onPowerOff={
          headphones
            ? () => {
                void headphones.powerOff();
                setShowSettings(false);
              }
            : undefined
        }
        onDone={() => setShowSettings(false)}
      />
    );
  }

  switch (connection.status) {
    case "unsupported":
      return <UnsupportedBrowser />;
    case "idle":
      return (
        <ConnectIdle
          onConnect={connect}
          onReconnect={reconnectKnown}
          knownDevices={settings.knownDevices}
          grantedPorts={grantedPorts}
        />
      );
    case "connecting":
      return <Connecting onCancel={reset} />;
    case "failed":
      return <ConnectFailed message={connection.message} onRetry={connect} onChooseAnother={reset} />;
    case "connected":
    case "reconnecting":
      // Keep showing the dashboard with the last-known state while reconnecting (design §5.3
      // rule: "A banner replaces nothing") rather than dropping back to a blank screen.
      return deviceState && headphones ? (
        <Dashboard
          state={deviceState}
          headphones={headphones}
          onSettingsClick={() => setShowSettings(true)}
          reconnecting={connection.status === "reconnecting"}
          reconnectReason={connection.status === "reconnecting" ? connection.reason : undefined}
          controlLost={controlLost}
          savedCustomEq={settings.customEq}
          onCustomEqChange={(key, values) =>
            void update({ customEq: { ...settings.customEq, [key]: values } })
          }
          speakToChatLocked={settings.lockedSettings.speakToChat !== undefined}
          onLockSpeakToChange={(value) =>
            void update({ lockedSettings: { ...settings.lockedSettings, speakToChat: value } })
          }
          eqProfiles={settings.eqProfiles}
          onSaveEqProfile={(name, bands) =>
            void update({
              eqProfiles: [
                ...settings.eqProfiles,
                // Date-based id: unique enough for a local list, and it keeps them in the order
                // they were saved without a separate index.
                { id: `eq-${Date.now()}`, name, layout: bands.layout, values: [...bands.values] },
              ],
            })
          }
          onDeleteEqProfile={(id) =>
            void update({ eqProfiles: settings.eqProfiles.filter((p) => p.id !== id) })
          }
          onCancelReconnect={reset}
        />
      ) : (
        <Connecting onCancel={reset} />
      );
  }
}
