"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { acceptInvite, login, setupLead } from "@/app/actions/auth";
import { createInviteLink, newInviteLink } from "@/app/actions/team";
import { Icon } from "@/components/Icon";
import { MIN_PASSWORD, type FormState, type InviteState } from "@/lib/forms";

export function SubmitButton({ children, pending: pendingText, className = "btn btn-primary" }: { children: React.ReactNode; pending: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function FormError({ state }: { state: FormState | InviteState }) {
  if (!state?.error) return null;
  return (
    <p className="form-err" role="alert">
      {state.error}
    </p>
  );
}

function PasswordField({ id, label, autoComplete }: { id: string; label: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw">
        <input id={id} name={id} className="inp" type={show ? "text" : "password"} autoComplete={autoComplete} required />
        <button type="button" className="pw-t" onClick={() => setShow((v) => !v)} aria-pressed={show}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

export function LoginForm({ showSetup }: { showSetup: boolean }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="auth-form" noValidate>
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" className="inp" type="email" autoComplete="username" defaultValue={state?.fields?.email} required autoFocus />
      </div>
      <PasswordField id="password" label="Password" autoComplete="current-password" />
      <FormError state={state} />
      <SubmitButton pending="Signing in">Sign in</SubmitButton>
      {showSetup && (
        <p className="auth-note">
          First time here? <Link href="/setup">Set up the Lead account</Link>
        </p>
      )}
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupLead, undefined);
  return (
    <form action={action} className="auth-form" noValidate>
      <div className="field">
        <label htmlFor="name">Your full name</label>
        <input id="name" name="name" className="inp" autoComplete="name" defaultValue={state?.fields?.name} required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" className="inp" type="email" autoComplete="username" defaultValue={state?.fields?.email} required />
      </div>
      <PasswordField id="password" label={`Password (at least ${MIN_PASSWORD} characters)`} autoComplete="new-password" />
      <PasswordField id="confirm" label="Type the password again" autoComplete="new-password" />
      <div className="field">
        <label htmlFor="code">Setup code</label>
        <input id="code" name="code" className="inp" autoComplete="off" spellCheck={false} required />
        <span className="hint">The one-time code you were given with the app. It only works until the Lead account exists.</span>
      </div>
      <FormError state={state} />
      <SubmitButton pending="Creating your account">Create Lead account</SubmitButton>
    </form>
  );
}

export function AcceptInviteForm({ token, name, email }: { token: string; name: string; email: string }) {
  const [state, action] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="auth-form" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="name">Your full name</label>
        <input id="name" name="name" className="inp" autoComplete="name" defaultValue={state?.fields?.name ?? name} required autoFocus={!name} />
      </div>
      <div className="field">
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" className="inp" type="email" autoComplete="username" defaultValue={state?.fields?.email ?? email} required autoFocus={!!name} />
        <span className="hint">You&apos;ll use this to sign in.</span>
      </div>
      <PasswordField id="password" label={`Choose a password (at least ${MIN_PASSWORD} characters)`} autoComplete="new-password" />
      <PasswordField id="confirm" label="Type it again" autoComplete="new-password" />
      <FormError state={state} />
      <SubmitButton pending="Setting up">Join the team</SubmitButton>
    </form>
  );
}

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      input.current?.select();
    }
  };
  return (
    <div className="copy">
      <Icon name="link" size={16} className="copy-i" />
      <input ref={input} className="copy-inp" value={link} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
      <button type="button" className={`btn btn-sm${copied ? " is-done" : " btn-primary"}`} onClick={copy}>
        <Icon name={copied ? "check" : "copy"} size={15} />
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

export function InviteLinkForm() {
  const [state, action] = useActionState(createInviteLink, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.link) formRef.current?.reset();
  }, [state]);
  return (
    <div className="invite">
      <form ref={formRef} action={action} className="invite-form two" noValidate>
        <div className="field">
          <label htmlFor="inv-label">Who is it for? (optional, only you see this)</label>
          <input id="inv-label" name="label" className="inp" autoComplete="off" placeholder="e.g. Sara from imports" />
        </div>
        <SubmitButton pending="Creating link">
          <Icon name="plus" size={15} />
          Create invite link
        </SubmitButton>
      </form>
      <FormError state={state} />
      {state?.link && (
        <div className="invite-done" role="status">
          <p>
            <b>Invite link ready{state.name ? ` for ${state.name}` : ""}.</b> Send it to the person joining. They open it, type their name and email, and set a password.
            It works once and expires in 7 days.
          </p>
          <CopyLink link={state.link} />
        </div>
      )}
    </div>
  );
}

export function NewLinkButton({ userId }: { userId: string }) {
  const [state, action] = useActionState(newInviteLink, undefined);
  return (
    <div className="newlink">
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <SubmitButton pending="Making link" className="btn btn-sm">
          <Icon name="link" size={14} />
          New link
        </SubmitButton>
      </form>
      {state?.error && <span className="form-err sm">{state.error}</span>}
      {state?.link && (
        <div className="newlink-out">
          <CopyLink link={state.link} />
          <span className="hint">The old link no longer works.</span>
        </div>
      )}
    </div>
  );
}

export function ConfirmButton({
  action,
  userId,
  label,
  confirm,
  extra,
  danger = false,
}: {
  action: (form: FormData) => Promise<void>;
  userId: string;
  label: string;
  confirm: string;
  extra?: Record<string, string>;
  danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={`btn btn-sm btn-ghost${danger ? " danger" : ""}`} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="confirm">
      <input type="hidden" name="userId" value={userId} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span className="confirm-q">{confirm}</span>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(false)}>
        Keep
      </button>
      <SubmitButton pending="Working" className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`}>
        Yes, {label.toLowerCase()}
      </SubmitButton>
    </form>
  );
}

export function Greeting({ name }: { name: string }) {
  const [text, setText] = useState("Welcome");
  useEffect(() => {
    const h = new Date().getHours();
    setText(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <>
      {text}, {name.split(/\s+/)[0]}
    </>
  );
}

export function Today() {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }));
  }, []);
  return <div className="date">{text || " "}</div>;
}
