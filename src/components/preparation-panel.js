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

export default function PreparationPanel({ user, flash }) {
  const supabase = useMemo(() => createClient(), []);
  const [inputs, setInputs] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [batches, setBatches] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [busy, setBusy] = useState(false);

  const [newInputId, setNewInputId] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newUnit, setNewUnit] = useState("kg");

  const [portionGrams, setPortionGrams] = useState("");
  const [portionQuantity, setPortionQuantity] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [scrapsAmount, setScrapsAmount] = useState("");
  const [scrapsUnit, setScrapsUnit] = useState("kg");
  const [notes, setNotes] = useState("");

  async function load() {
    const [{ data: inputRows, error: inputError }, { data: destinationRows, error: destinationError }, { data: batchRows, error: batchError }] = await Promise.all([
      supabase.from("prep_inputs").select("*").eq("is_active", true).order("category").order("name"),
      supabase.from("prep_destinations").select("*").eq("is_active", true).order("name"),
      supabase.from("prep_batches").select("*, input:prep_inputs(name,category,emoji)").order("created_at", { ascending: false }).limit(80),
    ]);
    const firstError = inputError || destinationError || batchError;
    if (firstError) {
      flash?.("O módulo de pré-preparo ainda precisa da migration do banco.");
      return;
    }
    setInputs(inputRows || []);
    setDestinations(destinationRows || []);
    setBatches(batchRows || []);
    if (!newInputId && inputRows?.length) setNewInputId(inputRows[0].id);
    if (!destinationId && destinationRows?.length) setDestinationId(destinationRows[0].id);

    const ids = (batchRows || []).map(row => row.id);
    if (!ids.length) {
      setOutputs([]);
      return;
    }
    const { data: outputRows } = await supabase.from("prep_outputs").select("*, destination:prep_destinations(name)").in("batch_id", ids).order("created_at");
    setOutputs(outputRows || []);
  }

  useEffect(() => { load(); }, []);

  const selectedBatch = batches.find(row => row.id === selectedBatchId) || null;
  const selectedOutputs = selectedBatch ? outputs.filter(row => row.batch_id === selectedBatch.id) : [];
  const producedBase = selectedOutputs.reduce((sum, row) => sum + Number(row.portion_grams) * Number(row.quantity), 0);
  const scrapsBase = toBase(scrapsAmount || selectedBatch?.scraps_amount || 0, scrapsUnit || selectedBatch?.scraps_unit || "kg");
  const inputBase = Number(selectedBatch?.input_base || 0);
  const remainingBase = Math.max(0, inputBase - producedBase - scrapsBase);

  useEffect(() => {
    if (!selectedBatch) return;
    setScrapsAmount(selectedBatch.scraps_amount || "");
    setScrapsUnit(selectedBatch.scraps_unit || "kg");
    setNotes(selectedBatch.notes || "");
  }, [selectedBatchId]);

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
    await load();
    setSelectedBatchId(data.id);
    flash?.("Lote de pré-preparo iniciado.");
  }

  async function addOutput(event) {
    event.preventDefault();
    const grams = numberValue(portionGrams);
    const quantity = Math.trunc(numberValue(portionQuantity));
    if (!selectedBatch || grams <= 0 || quantity <= 0) return flash?.("Informe o peso e a quantidade das porções.");
    const nextProduced = producedBase + grams * quantity;
    if (nextProduced > inputBase + 0.001) return flash?.("As porções ultrapassam a quantidade bruta do lote.");
    setBusy(true);
    const { error } = await supabase.from("prep_outputs").insert({
      batch_id: selectedBatch.id,
      portion_grams: grams,
      quantity,
      destination_id: destinationId || null,
    });
    setBusy(false);
    if (error) return flash?.(error.message);
    setPortionGrams("");
    setPortionQuantity("");
    await load();
  }

  async function removeOutput(id) {
    setBusy(true);
    const { error } = await supabase.from("prep_outputs").delete().eq("id", id);
    setBusy(false);
    if (error) return flash?.(error.message);
    await load();
  }

  async function saveBatch({ finish = false } = {}) {
    if (!selectedBatch) return;
    const amount = numberValue(scrapsAmount);
    const base = toBase(amount, scrapsUnit);
    const closure = producedBase + base;
    if (closure > inputBase + 0.001) return flash?.("Porções + aparas ultrapassam o peso bruto do lote.");
    if (finish && Math.abs(inputBase - closure) > 1) {
      return flash?.(`Ainda faltam registrar ${kgFromBase(inputBase - closure)} kg do lote entre porções e aparas.`);
    }
    setBusy(true);
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
    await load();
    if (finish) setSelectedBatchId("");
    flash?.(finish ? "Produção concluída e registrada." : "Produção salva.");
  }

  const activeBatches = batches.filter(row => row.status === "in_progress");
  const completedBatches = batches.filter(row => row.status === "completed");

  if (selectedBatch) {
    return <div className="prep-panel">
      <div className="page-heading prep-heading"><div><p className="eyebrow">PRÉ-PREPARO · ARAÚJO</p><h1>Registrar produção</h1><p className="muted">O insumo bruto é retirado, preparado e convertido em porções para uso interno.</p></div><button className="secondary" onClick={() => setSelectedBatchId("")}>Voltar</button></div>

      <section className="card prep-batch-hero">
        <div className="prep-product-icon">{selectedBatch.input?.emoji || "🥩"}</div>
        <div><span className="muted small">{selectedBatch.input?.category}</span><h2>{selectedBatch.input?.name}</h2><p><b>{selectedBatch.input_amount} {selectedBatch.input_unit}</b> de insumo bruto</p></div>
        <span className="prep-status in-progress">Em preparo</span>
      </section>

      <section className="card prep-section">
        <div className="section-title"><h2>Porções produzidas</h2><span>{selectedOutputs.length} tipos/destinos</span></div>
        {selectedOutputs.map(row => <div className="prep-output-row" key={row.id}>
          <div><b>{row.quantity} × {Number(row.portion_grams).toLocaleString("pt-BR")} g</b><small>{row.destination?.name || "Destino não informado"} · {(Number(row.portion_grams) * Number(row.quantity) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg</small></div>
          <button type="button" className="prep-delete" onClick={() => removeOutput(row.id)} disabled={busy} aria-label="Remover porção">×</button>
        </div>)}
        {!selectedOutputs.length && <p className="muted">Nenhuma porção registrada ainda.</p>}
        <form className="prep-output-form" onSubmit={addOutput}>
          <label>Peso por porção (g)<input inputMode="decimal" value={portionGrams} onChange={e => setPortionGrams(e.target.value)} placeholder="400" /></label>
          <label>Quantidade<input inputMode="numeric" value={portionQuantity} onChange={e => setPortionQuantity(e.target.value)} placeholder="6" /></label>
          <label>Destino<select value={destinationId} onChange={e => setDestinationId(e.target.value)}>{destinations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <button className="secondary" disabled={busy}>Adicionar porção</button>
        </form>
      </section>

      <section className="card prep-section">
        <div className="section-title"><h2>Aparas / sobra</h2><span>restante do porcionamento</span></div>
        <div className="prep-scraps">
          <input inputMode="decimal" value={scrapsAmount} onChange={e => setScrapsAmount(e.target.value)} placeholder="0" />
          <select value={scrapsUnit} onChange={e => setScrapsUnit(e.target.value)}><option>kg</option><option>g</option></select>
        </div>
        <label className="prep-notes">Observação<textarea maxLength={500} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: aparas reservadas para aproveitamento interno." /></label>
      </section>

      <section className="prep-summary">
        <div><small>Entrada bruta</small><b>{kgFromBase(inputBase)} kg</b></div>
        <div><small>Porções</small><b>{kgFromBase(producedBase)} kg</b></div>
        <div><small>Aparas</small><b>{kgFromBase(scrapsBase)} kg</b></div>
        <div><small>Falta registrar</small><b>{kgFromBase(remainingBase)} kg</b></div>
      </section>

      <div className="prep-actions"><button className="secondary" onClick={() => saveBatch()} disabled={busy}>Salvar produção</button><button className="primary" onClick={() => saveBatch({ finish: true })} disabled={busy}>Concluir lote</button></div>
    </div>;
  }

  return <div className="prep-panel">
    <div className="page-heading"><div><p className="eyebrow">PRÉ-PREPARO · ARAÚJO</p><h1>Produção de proteínas</h1><p className="muted">Você mesmo retira o insumo bruto, prepara as porções e registra o rendimento.</p></div></div>

    <form className="card prep-new-batch" onSubmit={createBatch}>
      <div className="section-title"><h2>Iniciar nova produção</h2><span>independente de pedido</span></div>
      <div className="prep-new-grid">
        <label>Insumo<select value={newInputId} onChange={e => setNewInputId(e.target.value)}>{inputs.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Quantidade bruta<input inputMode="decimal" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="5" /></label>
        <label>Unidade<select value={newUnit} onChange={e => setNewUnit(e.target.value)}><option>kg</option><option>g</option></select></label>
        <button className="primary" disabled={busy}>Iniciar lote</button>
      </div>
    </form>

    <section className="prep-list-section">
      <div className="section-title"><h2>Em preparo</h2><span>{activeBatches.length} lotes</span></div>
      <div className="prep-batch-list">{activeBatches.map(batch => {
        const batchOutputs = outputs.filter(row => row.batch_id === batch.id);
        const total = batchOutputs.reduce((sum, row) => sum + Number(row.portion_grams) * Number(row.quantity), 0);
        return <button className="card prep-batch-card" type="button" key={batch.id} onClick={() => setSelectedBatchId(batch.id)}>
          <span className="prep-product-icon">{batch.input?.emoji || "🥩"}</span>
          <span className="prep-batch-info"><b>{batch.input?.name}</b><small>{batch.input_amount} {batch.input_unit} bruto · {batchOutputs.reduce((sum, row) => sum + Number(row.quantity), 0)} porções · {kgFromBase(total)} kg produzidos</small></span>
          <span className="prep-open">Abrir ›</span>
        </button>;
      })}</div>
      {!activeBatches.length && <div className="empty card"><span>✓</span><h2>Nenhum lote aberto</h2><p>Inicie uma produção quando retirar um insumo da câmara.</p></div>}
    </section>

    {completedBatches.length > 0 && <section className="prep-list-section">
      <div className="section-title"><h2>Produções concluídas</h2><span>{completedBatches.length} registros</span></div>
      <div className="prep-history">{completedBatches.slice(0, 10).map(batch => <div className="card prep-history-row" key={batch.id}><span>{batch.input?.emoji || "🥩"}</span><div><b>{batch.input?.name}</b><small>{batch.input_amount} {batch.input_unit} bruto · {kgFromBase(batch.scraps_base)} kg de aparas</small></div></div>)}</div>
    </section>}
  </div>;
}
