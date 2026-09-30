"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Brand from "@/components/brand";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "invalid-link") {
      setErrorMessage("Esse link expirou ou já foi usado. Peça um novo link de recuperação.");
    } else if (error === "configuration") {
      setErrorMessage("Não foi possível conectar ao Supabase. Tente novamente mais tarde.");
    }
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    if (password.length < 8) {
      setErrorMessage("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setErrorMessage("As senhas não são iguais. Confira os dois campos.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setErrorMessage("Não foi possível conectar ao Supabase.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setErrorMessage("O link pode ter expirado ou sido usado. Peça um novo link de recuperação e tente novamente.");
      return;
    }
    setPassword("");
    setConfirmation("");
    setMessage("Senha atualizada. Agora você já pode entrar com a nova senha.");
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Brand />
        <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p>
        <h1>Crie uma nova senha</h1>
        <p className="muted">Escolha uma senha com pelo menos 8 caracteres e confirme no segundo campo.</p>
        <label>Nova senha<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Confirme a nova senha<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        {message && <p className="notice">{message}</p>}
        {errorMessage && <p className="notice error">{errorMessage}</p>}
        <button className="primary full" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
        <p className="auth-foot"><Link href="/login">Voltar para entrar</Link></p>
      </form>
    </main>
  );
}
