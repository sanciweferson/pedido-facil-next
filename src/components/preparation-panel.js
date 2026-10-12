"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const factors = { g: 1, kg: 1000 };

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBase(amount, unit) {
  return numberValue(amount) * (factors[unit] || 1);
}

function kgFromBase(value) {
  return (Number(value || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function localDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function dateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function dayStart(value) {
  return new Date(`${value}T00:00:00-03:00`);
}

function nextDay(value) {
  const date = dayStart(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function formatStock(row, value = row.balance_base) {
  const amount = Number(value || 0);
  if (row.stock_type === "weight") {
    if (Math.abs(amount) >= 1000) return `${(amount / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
    return `${amount.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g`;
  }
  return `${amount.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} un`;
}

export default function PreparationPanel({ user, flash }) {
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState("dashboard");
  const [inputs, setInputs] = useState([]);
  const [preparedItems, setPreparedItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [stock, setStock] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [openOutputCategory, setOpenOutputCategory] = useState("Porções");
  const [busy, setBusy] = useState(false);

  const [newInputId, setNewInputId] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newUnit, setNewUnit] = useState("kg");
  const [drafts, setDrafts] = useState({});
  const [scrapsAmount, setScrapsAmount] = useState("");
  const [scrapsUnit, setScrapsUnit] = useState("kg");
  const [notes, setNotes] = useState("");

  const today = dateInput();
  const [reportStart, setReportStart] = useState(today);
  const [reportEnd, setReportEnd] = useState(today);

  async function load({ quiet = false } = {}) {
    if (!quiet) setBusy(true);
    const [
      inputResult,
      itemResult,
      batchResult,
      stockResult,
    ] = await Promise.all([
      supabase.from("prep_inputs").select("*").eq("is_active", true).order("category").order("name"),
      supabase.from("prepared_items").select("*, destination:sectors(name,slug)").eq("is_active", true).order("category").order("name"),
      supabase.from("prep_batches").select("*, input:prep_inputs(name,category,emoji)").order("created_at", { ascending: false }).limit(250),
      supabase.rpc("get_prepared_stock"),
    ]);

    const inputRows = inputResult.data || [];
    const itemRows = itemResult.data || [];
    const batchRows = batchResult.data || [];
    const stockRows = stockResult.data || [];

    setInputs(inputRows);
    setPreparedItems(itemRows);
    setBatches(batchRows);
    setStock(stockRows);

    setNewInputId(current => {
      if (current && inputRows.some(row => row.id === current)) return current;
      return inputRows[0]?.id || "";
    });

    const firstError = inputResult.error || itemResult.error || batchResult.error || stockResult.error;
    if (firstError) flash?.(firstError.message);

    const ids = batchRows.map(row => row.id);
    if (ids.length) {
      const { data: outputRows, error: outputError } = await supabase
        .from("prep_outputs")
        .select("*, prepared_item:prepared_items(name,category,emoji,stock_type,portion_grams,default_unit,destination_sector_id,destination:sectors(name))")
        .in("batch_id", ids)
        .order("created_at");
      if (outputError) flash?.(outputError.message);
      else setOutputs(outputRows || []);
    } else {
      setOutputs([]);
    }
    if (!quiet) setBusy(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("preparation-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "prep_batches" }, () => load({ quiet: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "prep_outputs" }, () => load({ quiet: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => load({ quiet: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "closeout_items" }, () => load({ quiet: true }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const selectedBatch = batches.find(row => row.id === selectedBatchId) || null;
  const selectedOutputs = selectedBatch ? outputs.filter(row => row.batch_id === selectedBatch.id) : [];
  const availableOutputs = selectedBatch ? preparedItems.filter(row => row.source_input_id === selectedBatch.input_id) : [];
  const portion200 = availableOutputs.find(item => item.stock_type === "count" && Number(item.portion_grams) === 200) || null;
  const portion400 = availableOutputs.find(item => item.stock_type === "count" && Number(item.portion_grams) === 400) || null;
  const extraOutputs = availableOutputs.filter(item => item.id !== portion200?.id && item.id !== portion400?.id);

  const producedBase = selectedOutputs.reduce((sum, row) => {
    if (row.prepared_item?.stock_type === "weight") return sum + Number(row.amount_base || 0);
    if (Number(row.portion_grams) > 0) return sum + Number(row.portion_grams) * Number(row.quantity || 0);
    return sum;
  }, 0);
  const hasUnweighedOutput = selectedOutputs.some(row => row.prepared_item?.stock_type === "count" && !Number(row.portion_grams) && Number(row.quantity) > 0);
  const scrapsBase = toBase(scrapsAmount || selectedBatch?.scraps_amount || 0, scrapsUnit || selectedBatch?.scraps_unit || "kg");
  const inputBase = Number(selectedBatch?.input_base || 0);
  const remainingBase = Math.max(0, inputBase - producedBase - scrapsBase);

  useEffect(() => {
    if (!selectedBatch) return;
    setScrapsAmount(selectedBatch.scraps_amount || "");
    setScrapsUnit(selectedBatch.scraps_unit || "kg");
    setNotes(selectedBatch.notes || "");
    const nextDrafts = {};
    for (const item of preparedItems.filter(row => row.source_input_id === selectedBatch.input_id)) {
      const existing = outputs.find(row => row.batch_id === selectedBatch.id && row.prepared_item_id === item.id);
      if (item.stock_type === "weight") {
        nextDrafts[item.id] = {
          amount: existing?.amount ?? "",
          unit: existing?.amount_unit || item.default_unit || "kg",
        };
      } else {
        nextDrafts[item.id] = { quantity: existing?.quantity ?? "" };
      }
    }
    setDrafts(nextDrafts);
  }, [selectedBatchId, preparedItems.length, outputs.length]);

  async function createBatch(event) {
    event.preventDefault();
    const amount = numberValue(newAmount);
    if (!newInputId || amount <= 0) return flash?.("Informe o insumo e a quantidade bruta.");
    setBusy(true);
    const { data, error } = await supabase.from("prep_batches").insert({
      input_id: newInputId,
      created_by: user.id,
      input_amount: amount,
      input_unit: newUnit,
      input_base: toBase(amount, newUnit),
      status: "in_progress",
    }).select("*, input:prep_inputs(name,category,emoji)").single();
    setBusy(false);
    if (error) return flash?.(error.message);
    setNewAmount("");
    await load({ quiet: true });
    setSelectedBatchId(data.id);
    setSection("production");
    flash?.("Lote iniciado. Agora registre os produtos preparados.");
  }

  async function persistOutputs(items = availableOutputs) {
    for (const item of items) {
      const draft = drafts[item.id] || {};
      const existing = selectedOutputs.find(row => row.prepared_item_id === item.id);
      let payload = null;

      if (item.stock_type === "weight") {
        const amount = numberValue(draft.amount);
        if (amount > 0) {
          const unit = draft.unit || item.default_unit || "kg";
          payload = {
            batch_id: selectedBatch.id,
            prepared_item_id: item.id,
            portion_grams: null,
            quantity: null,
            amount,
            amount_unit: unit,
            amount_base: toBase(amount, unit),
          };
        }
      } else {
        const quantity = Math.trunc(numberValue(draft.quantity));
        if (quantity > 0) {
          payload = {
            batch_id: selectedBatch.id,
            prepared_item_id: item.id,
            portion_grams: item.portion_grams || null,
            quantity,
            amount: null,
            amount_unit: null,
            amount_base: null,
          };
        }
      }

      if (!payload && existing) {
        const { error } = await supabase.from("prep_outputs").delete().eq("id", existing.id);
        if (error) return error;
      } else if (payload && existing) {
        const { error } = await supabase.from("prep_outputs").update(payload).eq("id", existing.id);
        if (error) return error;
      } else if (payload) {
        const { error } = await supabase.from("prep_outputs").insert(payload);
        if (error) return error;
      }
    }
    return null;
  }

  function draftProducedBase() {
    return availableOutputs.reduce((sum, item) => {
      const draft = drafts[item.id] || {};
      if (item.stock_type === "weight") {
        return sum + toBase(draft.amount, draft.unit || item.default_unit || "kg");
      }
      return sum + Number(item.portion_grams || 0) * Math.trunc(numberValue(draft.quantity));
    }, 0);
  }

  async function saveAllOutputs() {
    if (!selectedBatch) return;
    setBusy(true);
    const error = await persistOutputs();
    setBusy(false);
    if (error) return flash?.(error.message);
    await load({ quiet: true });
    flash?.("Produção parcial salva.");
  }

  async function saveBatch({ finish = false } = {}) {
    if (!selectedBatch) return;
    const amount = numberValue(scrapsAmount);
    const base = toBase(amount, scrapsUnit);
    const draftBase = draftProducedBase();
    const hasDraftUnweighed = availableOutputs.some(item =>
      item.stock_type === "count" && !Number(item.portion_grams) && Math.trunc(numberValue(drafts[item.id]?.quantity)) > 0
    );
    const closure = draftBase + base;

    if (closure > inputBase + 1) return flash?.("Produção + aparas ultrapassam a quantidade bruta do lote.");
    if (finish && !hasDraftUnweighed && Math.abs(inputBase - closure) > 1) {
      return flash?.(`Ainda faltam registrar ${kgFromBase(inputBase - closure)} kg entre as porções e as aparas.`);
    }

    setBusy(true);
    const outputError = await persistOutputs();
    if (outputError) {
      setBusy(false);
      return flash?.(outputError.message);
    }

    const payload = {
      scraps_amount: amount,
      scraps_unit: scrapsUnit,
      scraps_base: base,
      notes: notes.trim() || null,
    };
    if (finish) {
      payload.status = "completed";
      payload.completed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("prep_batches").update(payload).eq("id", selectedBatch.id);
    setBusy(false);
    if (error) return flash?.(error.message);
    await load({ quiet: true });
    if (finish) {
      setSelectedBatchId("");
      setSection("dashboard");
    }
    flash?.(finish ? "Produção concluída. O saldo da Cozinha foi atualizado." : "Lote e porções salvos.");
  }

  function setPreset(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setReportStart(dateInput(start));
    setReportEnd(dateInput(end));
  }

  const activeBatches = batches.filter(row => row.status === "in_progress");
  const completedBatches = batches.filter(row => row.status === "completed");
  const todayStart = dayStart(today);
  const tomorrow = nextDay(today);
  const completedToday = completedBatches.filter(row => {
    const when = new Date(row.completed_at || row.created_at);
    return when >= todayStart && when < tomorrow;
  });
  const completedTodayIds = new Set(completedToday.map(row => row.id));
  const todayOutputs = outputs.filter(row => completedTodayIds.has(row.batch_id));
  const todayPortions = todayOutputs.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const todayProducedBase = todayOutputs.reduce((sum, row) => {
    if (row.prepared_item?.stock_type === "weight") return sum + Number(row.amount_base || 0);
    return sum + Number(row.portion_grams || 0) * Number(row.quantity || 0);
  }, 0);
  const todayScraps = completedToday.reduce((sum, row) => sum + Number(row.scraps_base || 0), 0);

  const reportStartDate = dayStart(reportStart);
  const reportEndDate = nextDay(reportEnd);
  const reportBatches = completedBatches.filter(row => {
    const when = new Date(row.completed_at || row.created_at);
    return when >= reportStartDate && when < reportEndDate;
  });
  const reportIds = new Set(reportBatches.map(row => row.id));
  const reportOutputs = outputs.filter(row => reportIds.has(row.batch_id));
  const reportSummary = Object.values(reportOutputs.reduce((acc, row) => {
    const key = row.prepared_item_id || `legacy-${row.portion_grams}`;
    const item = row.prepared_item;
    if (!acc[key]) acc[key] = {
      key,
      name: item?.name || `Porção de ${row.portion_grams || "?"} g`,
      emoji: item?.emoji || "📦",
      stock_type: item?.stock_type || "count",
      portion_grams: item?.portion_grams || row.portion_grams,
      quantity: 0,
      base: 0,
    };
    acc[key].quantity += Number(row.quantity || 0);
    acc[key].base += item?.stock_type === "weight"
      ? Number(row.amount_base || 0)
      : Number(row.portion_grams || 0) * Number(row.quantity || 0);
    return acc;
  }, {}));

  if (selectedBatch) {
    return <div className="prep-panel">
      <div className="page-heading prep-heading">
        <div><p className="eyebrow">PRÉ-PREPARO · PRODUÇÃO</p><h1>{selectedBatch.input?.name}</h1><p className="muted">Registre o rendimento do lote e envie os produtos preparados para o estoque interno.</p></div>
        <button className="secondary" type="button" onClick={() => setSelectedBatchId("")}>← Voltar</button>
      </div>

      <section className="card prep-batch-hero">
        <div className="prep-product-icon">{selectedBatch.input?.emoji || "🥩"}</div>
        <div><span className="muted small">{selectedBatch.input?.category}</span><h2>{selectedBatch.input?.name}</h2><p><b>{selectedBatch.input_amount} {selectedBatch.input_unit}</b> retirados da câmara</p></div>
        <span className="prep-status in-progress">Em preparo</span>
      </section>

      <section className="prep-progress-card card">
        <div><small>Entrada bruta</small><b>{kgFromBase(inputBase)} kg</b></div>
        <div><small>Produção medida</small><b>{kgFromBase(producedBase)} kg</b></div>
        <div><small>Aparas</small><b>{kgFromBase(scrapsBase)} kg</b></div>
        <div><small>{hasUnweighedOutput ? "Saldo não pesado" : "Falta registrar"}</small><b>{kgFromBase(remainingBase)} kg</b></div>
      </section>

      <section className="card prep-portion-card">
        <div className="section-title">
          <div><p className="eyebrow">PORCIONAMENTO</p><h2>Quantas porções foram feitas?</h2></div>
          <span>{selectedBatch.input?.name}</span>
        </div>

        {(portion400 || portion200) ? <div className="prep-fixed-portions">
          {portion400 && <label className="prep-fixed-portion">
            <span className="prep-fixed-weight">400 <small>g</small></span>
            <span className="prep-fixed-label">Porções de 400 gramas</span>
            <div className="prep-fixed-control">
              <input
                inputMode="numeric"
                value={drafts[portion400.id]?.quantity ?? ""}
                onChange={e => setDrafts(prev => ({ ...prev, [portion400.id]: { ...prev[portion400.id], quantity: e.target.value } }))}
                placeholder="0"
              />
              <b>porções</b>
            </div>
          </label>}

          {portion200 && <label className="prep-fixed-portion">
            <span className="prep-fixed-weight">200 <small>g</small></span>
            <span className="prep-fixed-label">Porções de 200 gramas</span>
            <div className="prep-fixed-control">
              <input
                inputMode="numeric"
                value={drafts[portion200.id]?.quantity ?? ""}
                onChange={e => setDrafts(prev => ({ ...prev, [portion200.id]: { ...prev[portion200.id], quantity: e.target.value } }))}
                placeholder="0"
              />
              <b>porções</b>
            </div>
          </label>}
        </div> : <div className="notice">Este insumo ainda não tem porções de 400 g e 200 g configuradas.</div>}

        {extraOutputs.length > 0 && <details className="prep-extra-results">
          <summary>Outros produtos preparados</summary>
          <div className="prep-extra-results-body">{extraOutputs.map(item => {
            const draft = drafts[item.id] || {};
            return <label className="prep-extra-row" key={item.id}>
              <span><b>{item.emoji || "📦"} {item.name}</b><small>{item.destination?.name || "Destino"}</small></span>
              {item.stock_type === "weight" ? <div className="prep-output-input weight">
                <input inputMode="decimal" value={draft.amount ?? ""} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], amount: e.target.value } }))} placeholder="0" />
                <select value={draft.unit || item.default_unit || "kg"} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], unit: e.target.value } }))}><option>kg</option><option>g</option></select>
              </div> : <div className="prep-output-input">
                <input inputMode="numeric" value={draft.quantity ?? ""} onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...prev[item.id], quantity: e.target.value } }))} placeholder="0" />
                <span>un</span>
              </div>}
            </label>;
          })}</div>
        </details>}

        <button className="secondary prep-save-portions" type="button" onClick={saveAllOutputs} disabled={busy}>Salvar porções</button>
      </section>

      <section className="card prep-section prep-scraps-card">
        <div className="section-title"><div><p className="eyebrow">APARAS</p><h2>Quanto sobrou do preparo?</h2></div><span>o que não virou porção</span></div>
        <div className="prep-scraps"><input inputMode="decimal" value={scrapsAmount} onChange={e => setScrapsAmount(e.target.value)} placeholder="0" /><select value={scrapsUnit} onChange={e => setScrapsUnit(e.target.value)}><option>kg</option><option>g</option></select></div>
        <label className="prep-notes">Observação<textarea maxLength={500} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observação opcional sobre o preparo." /></label>
      </section>

      <div className="prep-actions">
        <button className="secondary" type="button" onClick={() => saveBatch()} disabled={busy}>Salvar lote</button>
        <button className="primary" type="button" onClick={() => saveBatch({ finish: true })} disabled={busy}>Concluir e enviar ao estoque</button>
      </div>
    </div>;
  }

  return <div className="prep-panel">
    <div className="page-heading prep-main-heading">
      <div><p className="eyebrow">PRÉ-PREPARO · ARAÚJO</p><h1>Central de produção</h1><p className="muted">Produção, estoque preparado e relatórios no mesmo lugar.</p></div>
      <button className="secondary" type="button" onClick={() => load()} disabled={busy}>↻ Atualizar</button>
    </div>

    <nav className="prep-tabs no-print">
      <button className={section === "dashboard" ? "active" : ""} onClick={() => setSection("dashboard")}>Visão geral</button>
      <button className={section === "production" ? "active" : ""} onClick={() => setSection("production")}>Produção</button>
      <button className={section === "stock" ? "active" : ""} onClick={() => setSection("stock")}>Estoque preparado</button>
      <button className={section === "reports" ? "active" : ""} onClick={() => setSection("reports")}>Relatórios</button>
    </nav>

    {section === "dashboard" && <>
      <section className="prep-dashboard-kpis">
        <article className="card"><span>Lotes em preparo</span><b>{activeBatches.length}</b><small>aguardando conclusão</small></article>
        <article className="card"><span>Produções hoje</span><b>{completedToday.length}</b><small>lotes concluídos</small></article>
        <article className="card"><span>Porções hoje</span><b>{todayPortions.toLocaleString("pt-BR")}</b><small>unidades produzidas</small></article>
        <article className="card"><span>Produção medida</span><b>{kgFromBase(todayProducedBase)} kg</b><small>{kgFromBase(todayScraps)} kg de aparas</small></article>
      </section>

      <section className="prep-list-section">
        <div className="section-title"><h2>Em preparo</h2><span>{activeBatches.length} lotes</span></div>
        <div className="prep-batch-list">{activeBatches.map(batch => {
          const batchOutputs = outputs.filter(row => row.batch_id === batch.id);
          return <button className="card prep-batch-card" type="button" key={batch.id} onClick={() => setSelectedBatchId(batch.id)}>
            <span className="prep-product-icon">{batch.input?.emoji || "🥩"}</span>
            <span className="prep-batch-info"><b>{batch.input?.name}</b><small>{batch.input_amount} {batch.input_unit} bruto · {batchOutputs.reduce((sum, row) => sum + Number(row.quantity || 0), 0)} porções registradas</small></span>
            <span className="prep-open">Abrir ›</span>
          </button>;
        })}</div>
        {!activeBatches.length && <div className="empty card"><span>✓</span><h2>Nenhum lote aberto</h2><p>Quando retirar um insumo da câmara, inicie uma nova produção.</p></div>}
      </section>

      <section className="prep-list-section">
        <div className="section-title"><h2>Últimas produções</h2><button className="text-button" type="button" onClick={() => setSection("reports")}>Ver relatórios</button></div>
        <div className="prep-history">{completedBatches.slice(0, 6).map(batch => {
          const batchOutputs = outputs.filter(row => row.batch_id === batch.id);
          return <div className="card prep-history-row" key={batch.id}>
            <span>{batch.input?.emoji || "🥩"}</span>
            <div><b>{batch.input?.name}</b><small>{localDate(batch.completed_at)} · {batchOutputs.map(row => row.prepared_item?.name || `${row.portion_grams} g`).join(" · ") || "sem saída registrada"}</small></div>
          </div>;
        })}</div>
      </section>
    </>}

    {section === "production" && <>
      <form className="card prep-new-batch prep-new-batch-featured" onSubmit={createBatch}>
        <div className="section-title"><div><p className="eyebrow">NOVO LOTE</p><h2>Iniciar nova produção</h2></div><span>retirada direta da câmara</span></div>
        <div className="prep-new-grid">
          <label>Insumo bruto<select value={newInputId} onChange={e => setNewInputId(e.target.value)} disabled={!inputs.length}><option value="">{inputs.length ? "Selecione uma proteína" : "Carregando proteínas..."}</option>{inputs.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>Quantidade bruta<input inputMode="decimal" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="5" /></label>
          <label>Unidade<select value={newUnit} onChange={e => setNewUnit(e.target.value)}><option>kg</option><option>g</option></select></label>
          <button className="primary" disabled={busy}>Iniciar lote</button>
        </div>
      </form>

      <section className="prep-list-section">
        <div className="section-title"><h2>Lotes em preparo</h2><span>{activeBatches.length}</span></div>
        <div className="prep-batch-list">{activeBatches.map(batch => <button className="card prep-batch-card" type="button" key={batch.id} onClick={() => setSelectedBatchId(batch.id)}>
          <span className="prep-product-icon">{batch.input?.emoji || "🥩"}</span>
          <span className="prep-batch-info"><b>{batch.input?.name}</b><small>{batch.input_amount} {batch.input_unit} bruto · iniciado em {localDate(batch.started_at)}</small></span>
          <span className="prep-open">Continuar ›</span>
        </button>)}</div>
      </section>
    </>}

    {section === "stock" && <>
      <div className="prep-stock-intro"><h2>Estoque preparado em tempo real</h2><p className="muted">A mesma informação que a Cozinha verá. Produção concluída soma; consumo confirmado desconta; retorno soma de volta.</p></div>
      <div className="prep-stock-grid">{stock.map(row => <article className="card prep-stock-card" key={row.item_id}>
        <div className="prep-stock-card-head"><span>{row.emoji || "📦"}</span><div><b>{row.item_name}</b><small>{row.destination_name}{row.portion_grams ? ` · ${Number(row.portion_grams)} g` : ""}</small></div></div>
        <strong className={Number(row.balance_base) <= 0 ? "empty" : ""}>{formatStock(row)}</strong>
        <div className="prep-stock-card-flow"><span>Produzido {formatStock(row, row.produced_base)}</span><span>Consumido {formatStock(row, row.consumed_base)}</span><span>Retorno {formatStock(row, row.returned_base)}</span></div>
      </article>)}</div>
    </>}

    {section === "reports" && <>
      <div className="page-heading report-heading prep-report-heading">
        <div><p className="eyebrow">RELATÓRIO DE PRÉ-PREPARO</p><h2>Produção por período</h2><p className="muted">Veja diariamente, semanalmente ou em qualquer intervalo o que foi produzido e as aparas registradas.</p></div>
        <button className="secondary no-print" type="button" onClick={() => window.print()}>Imprimir / salvar PDF</button>
      </div>
      <div className="prep-report-presets no-print"><button type="button" onClick={() => setPreset(1)}>Hoje</button><button type="button" onClick={() => setPreset(7)}>7 dias</button><button type="button" onClick={() => setPreset(30)}>30 dias</button></div>
      <section className="card prep-report-filters no-print">
        <label>De<input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} /></label>
        <label>Até<input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} /></label>
      </section>
      <section className="prep-report-kpis">
        <article className="card"><span>Lotes concluídos</span><b>{reportBatches.length}</b></article>
        <article className="card"><span>Porções</span><b>{reportOutputs.reduce((sum, row) => sum + Number(row.quantity || 0), 0).toLocaleString("pt-BR")}</b></article>
        <article className="card"><span>Aparas</span><b>{kgFromBase(reportBatches.reduce((sum, row) => sum + Number(row.scraps_base || 0), 0))} kg</b></article>
      </section>
      <section className="card prep-report-section">
        <div className="section-title"><h2>Resumo produzido</h2><span>{reportSummary.length} itens</span></div>
        {reportSummary.length ? reportSummary.map(row => <div className="prep-report-line" key={row.key}><span>{row.emoji} <b>{row.name}</b></span><strong>{row.stock_type === "weight" ? `${kgFromBase(row.base)} kg` : `${row.quantity.toLocaleString("pt-BR")} porções`}</strong></div>) : <p className="muted">Nenhuma produção concluída neste período.</p>}
      </section>
      <section className="card prep-report-section">
        <div className="section-title"><h2>Lotes</h2><span>{reportBatches.length}</span></div>
        {reportBatches.map(batch => <article className="prep-report-batch" key={batch.id}>
          <div><b>{batch.input?.emoji || "🥩"} {batch.input?.name}</b><small>{localDate(batch.completed_at)} · {batch.input_amount} {batch.input_unit} bruto</small></div>
          <span>{kgFromBase(batch.scraps_base)} kg de aparas</span>
        </article>)}
      </section>
    </>}
  </div>;
}
