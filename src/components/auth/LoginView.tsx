"use client";

// Port of login.html + login.js: password step, then (when the server asks) the e-mail code step.
// Also the notices from e-mail links and Google sign-in.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useGetAuthOptionsQuery,
  useLoginCodeMutation,
  useLoginMutation,
  useResendLoginCodeMutation,
  useResendVerificationMutation,
} from "@/store/connectApi";
import { errorText, isNetworkError } from "@/store/apiBaseQuery";
import { AuthFooter, Wordmark } from "@/components/site/SiteBits";

const NETWORK = "Network error. Check your connection and try again.";
const NOTICES: Record<string, ["notice" | "error", string]> = {
  verified: ["notice", "E-mail confirmed. Sign in to start."],
  expired: ["error", "That confirmation link has expired or was already used. Sign in to get a new one."],
  google: ["error", "Google sign-in did not finish. Try again, or use your e-mail and password."],
  disabled: ["error", "This account is turned off. Contact your administrator."],
  notconnected: ["error", "Your dealership isn't subscribed to AutoPulse Connect. Please contact AutoPulse."],
};

function noticeFrom(params: URLSearchParams): ["notice" | "error", string] | null {
  const key = params.get("verified") ? "verified" : params.get("verify") === "expired" ? "expired" : params.get("error");
  return (key && NOTICES[key]) || null;
}

export function LoginView() {
  const params = useSearchParams();
  const initial = noticeFrom(params);
  const { data: options } = useGetAuthOptionsQuery();
  const [login] = useLoginMutation();
  const [loginCode] = useLoginCodeMutation();
  const [resendCode] = useResendLoginCodeMutation();
  const [resendVerify] = useResendVerificationMutation();

  const [step, setStep] = useState<"password" | "code">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(initial?.[0] === "notice" ? initial[1] : "");
  const [error, setError] = useState(initial?.[0] === "error" ? initial[1] : "");
  const [showResendVerify, setShowResendVerify] = useState(false);
  const [busy, setBusy] = useState(false);

  const [challenge, setChallenge] = useState("");
  const [identity, setIdentity] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [codeDisabled, setCodeDisabled] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const codeFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
    else usernameRef.current?.focus();
  }, [step]);

  async function onLogin(event: React.FormEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!name || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError("");
    setShowResendVerify(false);
    setBusy(true);
    try {
      const data = await login({ username: name, password }).unwrap();
      if (data.codeRequired) {
        setChallenge(data.challenge || "");
        setIdentity(name);
        setSentTo(data.sentTo || "");
        setStep("code");
        return;
      }
      window.location.replace("/");
    } catch (err) {
      if (isNetworkError(err)) {
        setError(NETWORK);
      } else {
        setError(errorText(err, "Sign-in failed. Please try again."));
        if ((err as { data?: { unverified?: boolean } }).data?.unverified) setShowResendVerify(true);
        setPassword("");
        passwordRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onResendVerify() {
    await resendVerify({ email: username.trim() }).unwrap().catch(() => {});
    setShowResendVerify(false);
    setError("");
    setNotice("If that account still needs confirming, a new link is on its way.");
  }

  async function submitCode(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 6) {
      setCodeError("Enter the 6-digit code from the e-mail.");
      return;
    }
    setCodeError("");
    setCodeDisabled(true);
    let message = "";
    try {
      await loginCode({ challenge, code: digits }).unwrap();
      window.location.replace("/");
      return;
    } catch (err) {
      message = isNetworkError(err) ? NETWORK : errorText(err, "That code did not work.");
      if (!isNetworkError(err)) codeRef.current?.select();
      setCodeError(message);
    } finally {
      // Old login.js disabled on 410/429, then its `finally` re-enabled the button unless the message says
      // "Sign in again" — so only that message leaves it disabled.
      setCodeDisabled(/Sign in again/.test(message));
    }
  }

  function onCodeInput(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submitCode(digits);
  }

  async function onResendCode() {
    try {
      await resendCode({ challenge, email: identity }).unwrap();
      setCodeError("");
      setCodeNotice("A new code is on its way.");
      setCodeDisabled(false);
    } catch (err) {
      setCodeError(errorText(err, "Could not send a new code."));
      setCodeNotice("");
    }
  }

  function onBack() {
    setChallenge("");
    setStep("password");
    setPassword("");
  }

  return (
    <>
      <main className="login-shell">
        <section className="login-brand" aria-hidden="true">
          <Wordmark />
          <p>
            AI chat for car dealers: one inbox for WhatsApp, SMS, Messenger, Instagram and your website, with leads and
            visits booked for you.
          </p>
          <ul className="login-points">
            <li>Real-time conversations by contact</li>
            <li>AI answers from your live inventory</li>
            <li>Take over any chat with one click</li>
          </ul>
        </section>

        <section className="login-card">
          <Wordmark mobile alt="AutoPulse" />
          <div id="password-step" hidden={step !== "password"}>
            <h1>Sign in</h1>
            <p className="muted">Use your AutoPulse e-mail, or the inbox admin username.</p>
            <p className="notice" id="login-notice" hidden={!notice}>
              {notice}
            </p>
            <form id="login-form" noValidate onSubmit={onLogin}>
              <label className="field">
                <span>Email or username</span>
                <input
                  ref={usernameRef}
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={120}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-head">
                  Password{" "}
                  <a href="/forgot-password" className="field-link">
                    Forgot password?
                  </a>
                </span>
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p id="login-error" className="form-error" role="alert" hidden={!error}>
                {error}
              </p>
              <button type="button" className="btn btn-sm" id="resend-verify" hidden={!showResendVerify} onClick={onResendVerify}>
                Send the confirmation link again
              </button>
              <button id="login-submit" type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <div className="auth-or" id="google-or" hidden={!options?.google}>
              <span>or</span>
            </div>
            <a className="btn btn-block google-btn" id="google-btn" href="/auth/google" hidden={!options?.google}>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8z" />
                <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
              </svg>
              Sign in with Google
            </a>
            <p className="fineprint" id="signup-line" hidden={!options?.signup}>
              New dealer? <a href="/signup">Create an account</a> · <a href="/demo">Request a demo</a>
            </p>
            <p className="fineprint">Access is restricted to authorized users. Sign-in attempts are logged.</p>
          </div>
          <div id="code-step" hidden={step !== "code"}>
            <h1>Check your e-mail</h1>
            <p className="muted">
              We sent a 6-digit sign-in code to <strong id="code-sent-to">{sentTo}</strong>.
            </p>
            <form
              id="code-form"
              ref={codeFormRef}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submitCode(code);
              }}
            >
              <label className="field">
                <span>Sign-in code</span>
                <input
                  ref={codeRef}
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  className="code-input"
                  value={code}
                  onChange={(e) => onCodeInput(e.target.value)}
                />
              </label>
              <p id="code-error" className="form-error" role="alert" hidden={!codeError}>
                {codeError}
              </p>
              <p className="notice" id="code-notice" hidden={!codeNotice}>
                {codeNotice}
              </p>
              <button id="code-submit" type="submit" className="btn btn-primary btn-block" disabled={codeDisabled}>
                Verify and sign in
              </button>
            </form>
            <p className="fineprint">
              <button type="button" className="link-btn" id="code-resend" onClick={onResendCode}>
                Send a new code
              </button>{" "}
              ·{" "}
              <button type="button" className="link-btn" id="code-back" onClick={onBack}>
                Use a different account
              </button>
            </p>
          </div>
        </section>
      </main>
      <AuthFooter />
    </>
  );
}
