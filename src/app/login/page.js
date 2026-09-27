"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Brand from "@/components/brand";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Brand />
        <p className="eyebrow">ACESSO DA EQUIPE</p>
        <h1>Entrar no Pedido Fácil</h1>
        <p className="muted">Acesse os pedidos e as tarefas do seu setor.</p>
        <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {message && <p className="notice error">{message}</p>}
        <button className="primary full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <p className="auth-foot">Primeiro acesso? <Link href="/cadastro">Solicitar cadastro</Link></p>
      </form>
    </main>
  );
}
