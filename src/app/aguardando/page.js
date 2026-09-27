import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function WaitingPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_active").eq("user_id", user.id).maybeSingle();
  if (profile?.is_active) redirect("/dashboard");
  return <main className="auth-shell"><section className="auth-card"><div className="brand"><span className="brand-mark">⏳</span><span>Pedido <b>Fácil</b></span></div><p className="eyebrow">CADASTRO RECEBIDO</p><h1>Aguardando liberação</h1><p className="muted">Um administrador precisa confirmar seu setor e suas permissões. Depois, saia e entre novamente.</p><form action="/auth/signout" method="post"><button className="secondary full">Sair</button></form><p className="auth-foot"><Link href="/login">Voltar ao login</Link></p></section></main>;
}
