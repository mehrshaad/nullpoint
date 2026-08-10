import { useState } from "react";
import { useHeadphones } from "./state/useHeadphones.js";
import { ConnectIdle } from "./screens/ConnectIdle.js";
import { Connecting } from "./screens/Connecting.js";
import { ConnectFailed } from "./screens/ConnectFailed.js";
import { UnsupportedBrowser } from "./screens/UnsupportedBrowser.js";
import { Dashboard } from "./screens/Dashboard.js";
import { Settings } from "./screens/Settings.js";

export function App() {
  const { connection, deviceState, connect, reset, headphones } = useHeadphones();
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) return <Settings onDone={() => setShowSettings(false)} />;

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
      return deviceState && headphones ? (
        <Dashboard state={deviceState} headphones={headphones} onSettingsClick={() => setShowSettings(true)} />
      ) : (
        <Connecting onCancel={reset} />
      );
  }
}
