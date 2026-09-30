"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Brand from "@/components/brand";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setErrorMessage("Configure o Supabase no arquivo .env.local primeiro.");
      return;
    }

    setBusy(true);
    setMessage("");
    setErrorMessage("");
    const redirectTo = `${window.location.origin}/auth/confirm?next=/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);

    if (error) {
      const rateLimited = /rate limit|too many requests/i.test(error.message);
      setErrorMessage(rateLimited
        ? "O Supabase limitou o envio de e-mails por enquanto. Aguarde e tente novamente mais tarde."
        : "Não foi possível enviar o link agora. Confira o e-mail e tente novamente.");
      return;
    }

    setMessage("Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha. Confira também a caixa de spam.");
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Brand />
        <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p>
        <h1>Esqueceu sua senha?</h1>
        <p className="muted">Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</p>
        <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        {message && <p className="notice">{message}</p>}
        {errorMessage && <p className="notice error">{errorMessage}</p>}
        <button className="primary full" disabled={busy}>{busy ? "Enviando…" : "Enviar link de recuperação"}</button>
        <p className="auth-foot"><Link href="/login">Voltar para entrar</Link></p>
      </form>
    </main>
  );
}
