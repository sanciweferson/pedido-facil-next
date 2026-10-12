"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function formatStock(row, value = row.balance_base) {
  const amount = Number(value || 0);
  if (row.stock_type === "weight") {
    if (Math.abs(amount) >= 1000) return `${(amount / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
    return `${amount.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g`;
  }
  return `${amount.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${Math.abs(amount) === 1 ? "unidade" : "unidades"}`;
}

export default function PreparedStockPanel({ flash }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [openCategory, setOpenCategory] = useState("");

  async function loadStock({ quiet = false } = {}) {
    if (!quiet) setBusy(true);
    const { data, error } = await supabase.rpc("get_prepared_stock");
    if (!quiet) setBusy(false);
    if (error) {
      flash?.(error.message);
      return;
    }
    setRows(data || []);
    if (!openCategory && data?.length) setOpenCategory(data[0].category || "Preparados");
  }

  useEffect(() => {
    loadStock();
    const channel = supabase
      .channel("prepared-stock-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "prep_batches" }, () => loadStock({ quiet: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "prep_outputs" }, () => loadStock({ quiet: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => loadStock({ quiet: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "closeout_items" }, () => loadStock({ quiet: true }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const positive = rows.filter(row => Number(row.balance_base) > 0);
  const categories = Object.entries(rows.reduce((acc, row) => {
    const key = row.category || "Preparados";
    (acc[key] ||= []).push(row);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));

  const totalPortions = positive
    .filter(row => row.stock_type === "count")
    .reduce((sum, row) => sum + Number(row.balance_base || 0), 0);
  const totalWeight = positive
    .filter(row => row.stock_type === "weight")
    .reduce((sum, row) => sum + Number(row.balance_base || 0), 0);

  return <div className="prepared-stock-panel">
    <div className="page-heading prepared-heading">
      <div>
        <p className="eyebrow">ESTOQUE INTERNO · TEMPO REAL</p>
        <h1>Produtos preparados</h1>
        <p className="muted">O saldo soma o que o pré-preparo concluiu e desconta o consumo real após recebimentos e retornos.</p>
      </div>
      <button className="secondary" type="button" onClick={() => loadStock()} disabled={busy}>↻ Atualizar</button>
    </div>

    <section className="prepared-kpis">
      <article className="card prepared-kpi"><span>Disponíveis</span><b>{positive.length}</b><small>tipos de produto</small></article>
      <article className="card prepared-kpi"><span>Porções</span><b>{totalPortions.toLocaleString("pt-BR")}</b><small>unidades em saldo</small></article>
      <article className="card prepared-kpi"><span>Preparados por peso</span><b>{(totalWeight / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg</b><small>saldo atual</small></article>
    </section>

    {busy && !rows.length ? <div className="card prepared-loading">Carregando estoque preparado…</div> :
      categories.length ? <div className="prepared-categories">{categories.map(([category, items]) => {
        const isOpen = openCategory === category;
        return <section className={`card prepared-category ${isOpen ? "open" : ""}`} key={category}>
          <button className="prepared-category-toggle" type="button" onClick={() => setOpenCategory(isOpen ? "" : category)} aria-expanded={isOpen}>
            <span><b>{category}</b><small>{items.length} {items.length === 1 ? "item" : "itens"}</small></span>
            <i aria-hidden="true">⌄</i>
          </button>
          {isOpen && <div className="prepared-category-body">{items.map(row => <article className="prepared-stock-row" key={row.item_id}>
            <div className="prepared-stock-icon">{row.emoji || "📦"}</div>
            <div className="prepared-stock-name">
              <b>{row.item_name}</b>
              <small>{row.portion_grams ? `${Number(row.portion_grams).toLocaleString("pt-BR")} g por porção · ` : ""}{row.destination_name}</small>
            </div>
            <div className={`prepared-stock-balance ${Number(row.balance_base) <= 0 ? "empty" : ""}`}>
              <small>Disponível</small>
              <strong>{formatStock(row)}</strong>
            </div>
            <div className="prepared-stock-flow">
              <span>Produzido <b>{formatStock(row, row.produced_base)}</b></span>
              <span>Consumido <b>{formatStock(row, row.consumed_base)}</b></span>
              <span>Retornou <b>{formatStock(row, row.returned_base)}</b></span>
            </div>
          </article>)}</div>}
        </section>;
      })}</div> : <div className="empty card"><span>📦</span><h2>Nenhum preparado cadastrado</h2><p>Quando o pré-preparo concluir uma produção destinada ao seu setor, ela aparecerá aqui.</p></div>}
  </div>;
}
