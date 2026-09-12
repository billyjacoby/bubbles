import { getConnection } from "@/lib/session";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  // Pre-fill the URL on a re-auth, but never echo the password back.
  const existing = await getConnection();

  return (
    <main className="flex h-full items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Bubbles</h1>
          <p className="text-sm text-muted">
            Connect to your BlueBubbles server to get started.
          </p>
        </header>

        <SetupForm initialServerUrl={existing?.serverUrl} />
      </div>
    </main>
  );
}
