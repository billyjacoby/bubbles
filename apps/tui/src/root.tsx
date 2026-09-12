import { useState } from "react";
import type { Connection } from "@bubbles/shared";
import { App } from "./app.js";
import { Onboarding } from "./onboarding.js";

interface RootProps {
  initialConnection?: Connection;
  onboardingDefaults?: Partial<Connection>;
}

export function Root({ initialConnection, onboardingDefaults }: RootProps) {
  const [connection, setConnection] = useState(initialConnection);
  return connection ? (
    <App connection={connection} />
  ) : (
    <Onboarding initial={onboardingDefaults} onConnected={setConnection} />
  );
}
