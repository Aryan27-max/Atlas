"use client";

import { useActionState, useId } from "react";

import { login, type LoginState } from "@/lib/auth/actions";

import styles from "./LoginForm.module.css";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  const ids = { user: useId(), pass: useId(), error: useId() };
  const invalid = Boolean(state.error);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next} />

      <div className={styles.fields} data-invalid={invalid || undefined}>
        <div className={styles.field}>
          <input
            id={ids.user}
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder=" "
            defaultValue={state.username ?? ""}
            key={state.username ?? ""}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? ids.error : undefined}
            className={styles.input}
          />
          <label htmlFor={ids.user} className={styles.label}>
            Username
          </label>
        </div>
        <div className={styles.field}>
          <input
            id={ids.pass}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder=" "
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? ids.error : undefined}
            className={styles.input}
          />
          <label htmlFor={ids.pass} className={styles.label}>
            Password
          </label>
        </div>
      </div>

      <p id={ids.error} className={styles.error} role="alert" aria-live="assertive">
        {state.error ?? ""}
      </p>

      <button type="submit" className={`button ${styles.submit}`} disabled={pending} aria-disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
