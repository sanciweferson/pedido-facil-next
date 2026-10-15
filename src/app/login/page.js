"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Brand from "@/components/brand";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) return setMessage("Configure o Supabase no arquivo .env.local primeiro.");
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMessage(error.message);
    window.location.href = "/dashboard";
  }

  return (
    <main className="auth-shell auth-lunar-shell">
      <div className="auth-stars" aria-hidden="true" />
      <div className="auth-moon" aria-hidden="true" />
      <div className="auth-horizon" aria-hidden="true" />

      <form className="auth-card auth-glass-card" onSubmit={handleSubmit}>
        <div className="auth-brand-wrap">
          <Brand />
        </div>

        <p className="eyebrow auth-eyebrow">ACESSO DA EQUIPE</p>
        <h1>Bem-vindo de volta</h1>
        <p className="muted auth-subtitle">Entre para continuar no Pedido Fácil.</p>

        <label className="auth-field">
          <span>E-mail</span>
          <div className="auth-input-wrap">
            <span className="auth-input-icon" aria-hidden="true">✉</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
        </label>

        <label className="auth-field">
          <span>Senha</span>
          <div className="auth-input-wrap">
            <span className="auth-input-icon" aria-hidden="true">⌑</span>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Sua senha"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="auth-eye"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              title={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
        </label>

        <div className="auth-row">
          <label className="auth-remember">
            <input type="checkbox" defaultChecked />
            <span>Lembrar de mim</span>
          </label>
          <Link href="/forgot-password">Esqueci minha senha</Link>
        </div>

        {message && <p className="notice error auth-message">{message}</p>}

        <button className="primary full auth-submit" disabled={busy}>
          <span>{busy ? "Entrando…" : "Entrar"}</span>
          <span aria-hidden="true">→</span>
        </button>

        <div className="auth-divider" />

        <p className="auth-foot">Primeiro acesso? <Link href="/cadastro">Solicitar cadastro</Link></p>
        <p className="auth-tagline">Organização, agilidade e menos erros no dia a dia.</p>
      </form>
    </main>
  );
}
