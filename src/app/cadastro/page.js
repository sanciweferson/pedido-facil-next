"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Brand from "@/components/brand";

export default function RegisterPage() {
  const [sectors, setSectors] = useState([]);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from("sectors").select("id,name").order("name").then(({ data }) => setSectors(data || []));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) return setMessage("Configure o Supabase no arquivo .env.local primeiro.");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, requested_sector_id: sector } },
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage("Cadastro enviado. Um administrador precisa liberar seu setor e suas permissões antes do primeiro acesso.");
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Brand />
        <p className="eyebrow">NOVO ACESSO</p>
        <h1>Solicitar cadastro</h1>
        <p className="muted">O administrador confirma seu setor e o que você pode fazer.</p>
        <label>Seu nome<input required value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Setor<select required value={sector} onChange={e => setSector(e.target.value)}><option value="">Escolha o setor</option>{sectors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Senha<input type="password" minLength={8} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {message && <p className="notice">{message}</p>}
        <button className="primary full" disabled={busy}>{busy ? "Enviando…" : "Criar solicitação"}</button>
        <p className="auth-foot">Já tem acesso? <Link href="/login">Entrar</Link></p>
      </form>
    </main>
  );
}
