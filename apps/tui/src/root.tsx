import { useState } from "react";
import type { Connection } from "@bubbles/shared";
import { App } from "./app.js";
import type { TuiCache } from "./cache.js";
import { Onboarding } from "./onboarding.js";

interface RootProps {
  initialConnection?: Connection;
  initialCache?: TuiCache;
  onboardingDefaults?: Partial<Connection>;
}

export function Root({ initialConnection, initialCache, onboardingDefaults }: RootProps) {
  const [connection, setConnection] = useState(initialConnection);
  return connection ? (
    <App connection={connection} initialCache={initialCache} />
  ) : (
    <Onboarding initial={onboardingDefaults} onConnected={setConnection} />
  );
}
