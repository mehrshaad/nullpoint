import { useState } from "react";
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
  const { connection, deviceState, controlLost, connect, reset, headphones } = useHeadphones({
    autoReconnect: settings.reconnectAutomatically,
  });
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <Settings
        settings={settings}
        update={update}
        isDesktop={isDesktop}
        deviceState={deviceState}
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
      return <ConnectIdle onConnect={connect} />;
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
          onCancelReconnect={reset}
        />
      ) : (
        <Connecting onCancel={reset} />
      );
  }
}
