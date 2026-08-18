"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Radio } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const initialForm = {
  name: "",
  email: "",
  password: "",
};

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState("sign-in");
  const [formState, setFormState] = useState(initialForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [hasInvite, setHasInvite] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const nextHasInvite = searchParams.has("invite");
    const nextMode = searchParams.get("mode");
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setHasInvite(nextHasInvite);

        if (nextHasInvite || nextMode === "sign-up") {
          setMode("sign-up");
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");

    const response = mode === "sign-in"
      ? await authClient.signIn.email({
        email: formState.email,
        password: formState.password,
        callbackURL: "/workspace",
      })
      : await authClient.signUp.email({
        name: formState.name,
        email: formState.email,
        password: formState.password,
        callbackURL: "/workspace",
      });

    setPending(false);

    if (response.error) {
      setError(response.error.message ?? "Authentication failed.");
      return;
    }

    router.push("/workspace");
    router.refresh();
  }

  function updateField(field, value) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  function switchMode() {
    setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
    setError("");
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <Link className="auth-brand" href="/">
          <span><Radio size={17} aria-hidden="true" /></span>
          <strong>Runbook Studio</strong>
        </Link>

        <div className="auth-heading">
          <div className="auth-icon">
            <KeyRound size={18} aria-hidden="true" />
          </div>
          <p className="eyebrow">Workspace access</p>
          <h1>{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
          <p>
            {hasInvite
              ? "Create or sign in with the invited email to join the shared incident workspace."
              : "Use email and password authentication for the database-backed incident workspace."}
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "sign-up" && (
            <label className="field-label">
              Name
              <input
                autoComplete="name"
                required
                value={formState.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
            </label>
          )}

          <label className="field-label">
            Email
            <input
              autoComplete="email"
              required
              type="email"
              value={formState.email}
              onChange={(event) => updateField("email", event.target.value)}
            />
          </label>

          <label className="field-label">
            Password
            <input
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={8}
              required
              type="password"
              value={formState.password}
              onChange={(event) => updateField("password", event.target.value)}
            />
          </label>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button className="auth-submit" type="submit" disabled={pending}>
            <span>{pending ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>

        <button className="auth-switch" type="button" onClick={switchMode}>
          {mode === "sign-in" ? "Create a new workspace account" : "Use an existing account"}
        </button>
      </section>
    </main>
  );
}
