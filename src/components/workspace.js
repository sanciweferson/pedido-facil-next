"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import Brand from "@/components/brand"

const roleNames = {
  requester: "Solicitante",
  separator: "Separação",
  inventory: "Estoque",
  admin: "Administrador",
}
const statusNames = {
  requested: "Aguardando separação",
  separated: "Separado",
  received: "Recebido",
  return_submitted: "Retorno aguardando conferência",
  closed: "Concluído",
}
const unitsByType = { weight: ["g", "kg"], volume: ["ml", "L"], count: ["un"] }
const factors = { g: 1, kg: 1000, ml: 1, L: 1000, un: 1 }
const navByRole = {
  requester: [
    ["home", "Acompanhar pedidos"],
    ["request", "Fazer pedido"],
    ["receive", "Confirmar recebimento"],
    ["close", "Retorno e avarias"],
  ],
  separator: [
    ["home", "Acompanhar pedidos"],
    ["separate", "Separar pedidos"],
  ],
  inventory: [
    ["home", "Acompanhar pedidos"],
    ["inventory", "Lançar saída"],
    ["confirmReturn", "Conferir retorno"],
  ],
  admin: [
    ["home", "Acompanhar pedidos"],
    ["request", "Fazer pedido"],
    ["separate", "Separar pedidos"],
    ["receive", "Confirmar recebimento"],
    ["close", "Retorno e avarias"],
    ["inventory", "Lançar saída"],
    ["confirmReturn", "Conferir retorno"],
  ],
}

function localTime(value) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function parseAmount(value) {
  if (typeof value === "number") return value
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".")
  if (!normalized) return 0
  return Number(normalized)
}

function toBase(amount, unit) {
  const numeric = parseAmount(amount)
  return Number.isFinite(numeric) ? numeric * (factors[unit] || 1) : 0
}

function displayAmount(amount, unit) {
  if (amount === null || amount === undefined) return "—"
  let value = Number(amount)
  let shownUnit = unit
  if (unit === "g" && value >= 1000) {
    value /= 1000
    shownUnit = "kg"
  }
  if (unit === "kg" && value > 0 && value < 1) {
    value *= 1000
    shownUnit = "g"
  }
  if (unit === "ml" && value >= 1000) {
    value /= 1000
    shownUnit = "L"
  }
  if (unit === "L" && value > 0 && value < 1) {
    value *= 1000
    shownUnit = "ml"
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${shownUnit || ""}`.trim()
}

export default function Workspace({ user, initialProfile }) {
  const supabase = useMemo(() => createClient(), [])
  const [profile] = useState(initialProfile)
  const [view, setView] = useState("home")
  const [sectors, setSectors] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [closeouts, setCloseouts] = useState([])
  const [selectedCloseOrder, setSelectedCloseOrder] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [sectorId, setSectorId] = useState(profile.sector_id || "")
  const [quantities, setQuantities] = useState({})

  async function loadData() {
    if (!supabase) return
    const [
      { data: sectorRows },
      { data: productRows },
      { data: orderRows },
      { data: closeoutRows },
    ] = await Promise.all([
      supabase.from("sectors").select("id,name,slug").order("name"),
      supabase
        .from("products")
        .select("id,sector_id,name,category,unit_type,emoji")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("orders")
        .select("*, sector:sectors(name)")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("closeouts")
        .select(
          "*, sector:sectors(name), order:orders(order_code,requester_name)",
        )
        .order("created_at", { ascending: false })
        .limit(40),
    ])
    setSectors(sectorRows || [])
    setProducts(productRows || [])
    setOrders(orderRows || [])
    setCloseouts(closeoutRows || [])
    const ids = (orderRows || []).map((order) => order.id)
    if (ids.length) {
      const { data: itemRows } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", ids)
        .order("created_at")
      setItems(itemRows || [])
    } else setItems([])
  }

  useEffect(() => {
    loadData()
  }, [])

  function flash(text) {
    setNotice(text)
    window.setTimeout(() => setNotice(""), 4500)
  }

  function setQty(key, field, value) {
    setQuantities((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }))
  }

  function unitsFor(product) {
    return unitsByType[product?.unit_type] || ["un"]
  }
  function quantityFor(key, field, fallback, unitFallback) {
    return quantities[key]?.[field] ?? fallback ?? ""
  }

  async function submitOrder(event) {
    event.preventDefault()
    const selectedProducts = products.filter(
      (product) =>
        product.sector_id === sectorId &&
        parseAmount(quantities[product.id]?.amount) > 0,
    )
    if (!selectedProducts.length)
      return flash("Escolha pelo menos um produto e informe a quantidade.")
    setBusy(true)
    const sector = sectors.find((row) => row.id === sectorId)
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        sector_id: sectorId,
        requester_id: user.id,
        requester_name: profile.full_name,
        status: "requested",
        order_code: `PED-${Date.now().toString().slice(-6)}`,
      })
      .select()
      .single()
    if (error) {
      setBusy(false)
      return flash(error.message)
    }
    const orderItems = selectedProducts.map((product) => {
      const value = parseAmount(quantities[product.id].amount)
      const unit = quantities[product.id].unit || unitsFor(product)[0]
      return {
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        emoji: product.emoji,
        unit_type: product.unit_type,
        requested_amount: value,
        requested_unit: unit,
        requested_base: toBase(value, unit),
      }
    })
    const { error: itemError } = await supabase
      .from("order_items")
      .insert(orderItems)
    if (itemError) {
      await supabase.from("orders").delete().eq("id", order.id)
      setBusy(false)
      return flash(itemError.message)
    }
    setBusy(false)
    setQuantities({})
    await loadData()
    setView("home")
    flash(`Pedido enviado para ${sector?.name}.`)
  }

  async function setOrderItems(order, field, fallbackField) {
    for (const item of items.filter((row) => row.order_id === order.id)) {
      const key = `${order.id}:${item.id}`
      const value = parseAmount(
        quantities[key]?.amount ?? item[fallbackField] ?? item.requested_amount,
      )
      const unit =
        quantities[key]?.unit ??
        item[`${fallbackField.replace("amount", "unit")}`] ??
        item.requested_unit
      if (!Number.isFinite(value) || value < 0)
        throw new Error(
          `Digite uma quantidade válida para ${item.product_name}.`,
        )
      const { error } = await supabase
        .from("order_items")
        .update({
          [`${field}_amount`]: value,
          [`${field}_unit`]: unit,
          [`${field}_base`]: toBase(value, unit),
        })
        .eq("id", item.id)
      if (error) throw error
    }
  }

  async function confirmSeparation(order) {
    setBusy(true)
    try {
      await setOrderItems(order, "separated", "requested_amount")
      const { error } = await supabase
        .from("orders")
        .update({
          status: "separated",
          separated_by: user.id,
          separated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
      if (error) throw error
      await loadData()
      flash("Separação confirmada.")
    } catch (error) {
      flash(error.message)
    }
    setBusy(false)
  }

  async function confirmReceipt(order) {
    setBusy(true)
    try {
      await setOrderItems(order, "received", "separated_amount")
      const { error } = await supabase
        .from("orders")
        .update({
          status: "received",
          received_by: user.id,
          received_at: new Date().toISOString(),
        })
        .eq("id", order.id)
      if (error) throw error
      await loadData()
      flash("Recebimento confirmado.")
    } catch (error) {
      flash(error.message)
    }
    setBusy(false)
  }

  function reviewCloseout(order) {
    setSelectedCloseOrder(order)
    setView("reviewClose")
  }

  async function submitCloseout() {
    const order = selectedCloseOrder
    if (!order) return
    const orderItems = items.filter((item) => item.order_id === order.id)
    for (const item of orderItems) {
      const row = quantities[`close:${item.id}`] || {}
      const returned = parseAmount(row.returnAmount ?? 0)
      const damaged = parseAmount(row.damageAmount ?? 0)
      if (
        !Number.isFinite(returned) ||
        returned < 0 ||
        !Number.isFinite(damaged) ||
        damaged < 0
      ) {
        return flash(`Digite quantidades válidas para ${item.product_name}.`)
      }
      const returnUnit =
        row.returnUnit || item.received_unit || item.requested_unit
      const damageUnit =
        row.damageUnit || item.received_unit || item.requested_unit
      const receivedBase = Number(
        item.received_base ?? toBase(item.received_amount, item.received_unit),
      )
      if (
        toBase(returned, returnUnit) + toBase(damaged, damageUnit) >
        receivedBase
      ) {
        return flash(
          `Retorno + avaria de ${item.product_name} não podem superar o que foi recebido.`,
        )
      }
    }
    setBusy(true)
    const { data: closeout, error } = await supabase
      .from("closeouts")
      .insert({
        order_id: order.id,
        sector_id: order.sector_id,
        submitted_by: user.id,
        status: "submitted",
      })
      .select()
      .single()
    if (error) {
      setBusy(false)
      return flash(error.message)
    }
    const closeoutItems = orderItems.map((item) => {
      const key = `close:${item.id}`
      const returnAmount = parseAmount(quantities[key]?.returnAmount || 0)
      const returnUnit =
        quantities[key]?.returnUnit || item.received_unit || item.requested_unit
      const damageAmount = parseAmount(quantities[key]?.damageAmount || 0)
      const damageUnit =
        quantities[key]?.damageUnit || item.received_unit || item.requested_unit
      return {
        closeout_id: closeout.id,
        order_item_id: item.id,
        product_name: item.product_name,
        emoji: item.emoji,
        return_amount: returnAmount,
        return_unit: returnUnit,
        return_base: toBase(returnAmount, returnUnit),
        damage_amount: damageAmount,
        damage_unit: damageUnit,
        damage_base: toBase(damageAmount, damageUnit),
      }
    })
    const { error: rowsError } = await supabase
      .from("closeout_items")
      .insert(closeoutItems)
    if (rowsError) {
      await supabase.from("closeouts").delete().eq("id", closeout.id)
      setBusy(false)
      return flash(rowsError.message)
    }
    const { error: orderError } = await supabase
      .from("orders")
      .update({ status: "return_submitted" })
      .eq("id", order.id)
    setBusy(false)
    if (orderError) return flash(orderError.message)
    await loadData()
    setView("home")
    setSelectedCloseOrder(null)
    flash("Fechamento enviado ao Janiel para conferência.")
  }

  async function markInventory(order) {
    setBusy(true)
    const { error } = await supabase
      .from("orders")
      .update({
        inventory_logged_by: user.id,
        inventory_logged_at: new Date().toISOString(),
      })
      .eq("id", order.id)
    setBusy(false)
    if (error) return flash(error.message)
    await loadData()
    flash("Saída marcada como lançada no sistema da empresa.")
  }

  async function confirmCloseout(closeout) {
    const relatedOrder = orders.find((order) => order.id === closeout.order_id)
    if (!relatedOrder?.inventory_logged_at)
      return flash("Janiel: registre primeiro a saída no sistema da empresa.")
    setBusy(true)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from("closeouts")
      .update({
        status: "confirmed",
        confirmed_by: user.id,
        confirmed_at: now,
        inventory_logged_by: user.id,
        inventory_logged_at: now,
      })
      .eq("id", closeout.id)
    if (!error)
      await supabase
        .from("orders")
        .update({ status: "closed" })
        .eq("id", closeout.order_id)
    setBusy(false)
    if (error) return flash(error.message)
    await loadData()
    flash("Retorno conferido e lançamento registrado.")
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const nav = navByRole[profile.role] || navByRole.requester
  const visibleOrders = orders
  const itemsFor = (order) => items.filter((item) => item.order_id === order.id)
  const sectorLabel = (id) =>
    sectors.find((row) => row.id === id)?.name || "Setor"
  const orderCardContext = { sectorLabel, user, profile, busy }
  const productRowContext = { quantityFor, setQty, unitsFor }

  function renderView() {
    if (view === "home")
      return (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">PAINEL DO SETOR</p>
              <h1>Acompanhar pedidos</h1>
              <p className="muted">
                Veja o andamento e quem está com cada etapa.
              </p>
            </div>
          </div>
          <div className="sector-filter">
            <button className="filter-chip selected">Todos os setores</button>
            {sectors.map((sector) => (
              <button className="filter-chip" key={sector.id}>
                {sector.name}
              </button>
            ))}
          </div>
          <section className="stack">
            {visibleOrders.length ? (
              visibleOrders.map((order) => (
                <OrderCard key={order.id} {...orderCardContext} order={order}>
                  <div className="timeline">
                    <span className="done">Pedido enviado</span>
                    <span
                      className={
                        order.status !== "requested" ? "done" : "current"
                      }
                    >
                      Separação
                    </span>
                    <span
                      className={
                        ["received", "return_submitted", "closed"].includes(
                          order.status,
                        )
                          ? "done"
                          : "current"
                      }
                    >
                      Recebimento
                    </span>
                  </div>
                  <p className="small muted">
                    {itemsFor(order)
                      .map(
                        (item) =>
                          `${item.emoji || "📦"} ${item.product_name} · ${displayAmount(item.requested_amount, item.requested_unit)}`,
                      )
                      .join("   ·   ")}
                  </p>
                </OrderCard>
              ))
            ) : (
              <div className="empty card">
                <span>🧾</span>
                <h2>Nenhum pedido por aqui</h2>
                <p>
                  Quando um pedido for criado, o andamento aparece nesta tela.
                </p>
              </div>
            )}
          </section>
        </>
      )

    if (view === "request")
      return (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">NOVA REQUISIÇÃO</p>
              <h1>Fazer pedido</h1>
              <p className="muted">
                Seu nome e o horário ficam registrados automaticamente.
              </p>
            </div>
          </div>
          <form className="card form-card" onSubmit={submitOrder}>
            <label>
              Setor
              <select
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                disabled={
                  profile.role === "requester" && Boolean(profile.sector_id)
                }
                required
              >
                {sectors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="section-title">
              <h2>Produtos do setor</h2>
              <span>
                {products.filter((item) => item.sector_id === sectorId).length}{" "}
                itens
              </span>
            </div>
            {products
              .filter((item) => item.sector_id === sectorId)
              .map((product) => (
                <ProductRow
                  key={product.id}
                  {...productRowContext}
                  product={product}
                  keyId={product.id}
                  amount=""
                  unit={unitsFor(product)[0]}
                />
              ))}
            <div className="helper">
              A unidade é escolhida para cada produto: g, kg, ml, L ou un.
            </div>
            <button className="primary full" disabled={busy}>
              {busy ? "Enviando…" : "Enviar pedido"}
            </button>
          </form>
        </>
      )

    if (view === "separate")
      return (
        <>
          <PageTitle
            title="Pedidos para separar"
            text="Douglas: confira os itens e informe o que conseguiu separar."
          />
          {orders
            .filter((order) => order.status === "requested")
            .map((order) => (
              <OrderCard
                key={order.id}
                {...orderCardContext}
                order={order}
                action={confirmSeparation}
                actionText="Confirmar separação"
              >
                {itemsFor(order).map((item) => (
                  <ProductRow
                    key={item.id}
                    {...productRowContext}
                    product={item}
                    keyId={`${order.id}:${item.id}`}
                    field="amount"
                    amount={item.requested_amount}
                    unit={item.requested_unit}
                    label={`Solicitado: ${displayAmount(item.requested_amount, item.requested_unit)}`}
                  />
                ))}
              </OrderCard>
            ))}
          {orders.every((order) => order.status !== "requested") && (
            <Empty text="Não há pedidos aguardando separação." />
          )}
        </>
      )

    if (view === "receive")
      return (
        <>
          <PageTitle
            title="Confirmar recebimento"
            text="Confira o que chegou antes de confirmar."
          />
          {orders
            .filter(
              (order) =>
                order.status === "separated" && order.requester_id === user.id,
            )
            .map((order) => (
              <OrderCard
                key={order.id}
                {...orderCardContext}
                order={order}
                action={confirmReceipt}
                actionText="Confirmar recebimento"
              >
                {itemsFor(order).map((item) => (
                  <ProductRow
                    key={item.id}
                    {...productRowContext}
                    product={item}
                    keyId={`${order.id}:${item.id}`}
                    amount={item.separated_amount}
                    unit={item.separated_unit}
                    label={`Separado: ${displayAmount(item.separated_amount, item.separated_unit)}`}
                  />
                ))}
              </OrderCard>
            ))}
          {orders.every(
            (order) =>
              order.status !== "separated" || order.requester_id !== user.id,
          ) && (
            <Empty text="Você não tem pedidos separados aguardando confirmação." />
          )}
        </>
      )

    if (view === "close")
      return (
        <>
          <PageTitle
            title="Retorno e avarias"
            text="Informe o que sobrou e o que foi perdido ou danificado."
          />
          {orders
            .filter(
              (order) =>
                order.status === "received" && order.requester_id === user.id,
            )
            .map((order) => (
              <OrderCard
                key={order.id}
                {...orderCardContext}
                order={order}
                action={reviewCloseout}
                actionText="Revisar fechamento"
              >
                {itemsFor(order).map((item) => (
                  <div className="close-row" key={item.id}>
                    <div className="product-image">{item.emoji || "📦"}</div>
                    <b>{item.product_name}</b>
                    <label>
                      Retorno{" "}
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={
                          quantities[`close:${item.id}`]?.returnAmount ?? 0
                        }
                        onChange={(e) =>
                          setQty(
                            `close:${item.id}`,
                            "returnAmount",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    <select
                      value={
                        quantities[`close:${item.id}`]?.returnUnit ||
                        item.received_unit ||
                        item.requested_unit
                      }
                      onChange={(e) =>
                        setQty(`close:${item.id}`, "returnUnit", e.target.value)
                      }
                    >
                      {unitsFor(item).map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                    <label>
                      Avaria{" "}
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={
                          quantities[`close:${item.id}`]?.damageAmount ?? 0
                        }
                        onChange={(e) =>
                          setQty(
                            `close:${item.id}`,
                            "damageAmount",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    <select
                      value={
                        quantities[`close:${item.id}`]?.damageUnit ||
                        item.received_unit ||
                        item.requested_unit
                      }
                      onChange={(e) =>
                        setQty(`close:${item.id}`, "damageUnit", e.target.value)
                      }
                    >
                      {unitsFor(item).map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </OrderCard>
            ))}
          {orders.every(
            (order) =>
              order.status !== "received" || order.requester_id !== user.id,
          ) && <Empty text="Não há pedidos recebidos aguardando fechamento." />}
        </>
      )

    if (view === "reviewClose" && selectedCloseOrder)
      return (
        <>
          <PageTitle
            title="Revisar fechamento"
            text="Confira o retorno e as avarias antes de enviar para o Janiel."
          />
          <article className="card order-card">
            <p className="eyebrow">
              {sectorLabel(selectedCloseOrder.sector_id)} ·{" "}
              {selectedCloseOrder.order_code}
            </p>
            <h2>Solicitante: {profile.full_name}</h2>
            {itemsFor(selectedCloseOrder).map((item) => {
              const key = `close:${item.id}`
              const row = quantities[key] || {}
              return (
                <div className="simple-item" key={item.id}>
                  <span>
                    {item.emoji || "📦"} {item.product_name}
                  </span>
                  <span>
                    Retorno{" "}
                    <b>
                      {displayAmount(
                        parseAmount(row.returnAmount || 0),
                        row.returnUnit ||
                          item.received_unit ||
                          item.requested_unit,
                      )}
                    </b>{" "}
                    · Avaria{" "}
                    <b>
                      {displayAmount(
                        parseAmount(row.damageAmount || 0),
                        row.damageUnit ||
                          item.received_unit ||
                          item.requested_unit,
                      )}
                    </b>
                  </span>
                </div>
              )
            })}
            <p className="helper">
              Ao confirmar, Janiel verá estes valores para conferir fisicamente
              e lançar no sistema da empresa.
            </p>
            <div className="review-actions">
              <button className="secondary" onClick={() => setView("close")}>
                Voltar e editar
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={submitCloseout}
              >
                {busy ? "Enviando…" : "Confirmar e enviar ao Janiel"}
              </button>
            </div>
          </article>
        </>
      )

    if (view === "inventory")
      return (
        <>
          <PageTitle
            title="Lançar saída"
            text="Janiel: registre a saída no controle de estoque da empresa. Pode lançar antes ou depois da separação."
          />
          {orders
            .filter((order) => !order.inventory_logged_at)
            .map((order) => (
              <OrderCard
                key={order.id}
                {...orderCardContext}
                order={order}
                action={markInventory}
                actionText="Marcar saída lançada"
              >
                {itemsFor(order).map((item) => (
                  <div className="simple-item" key={item.id}>
                    <span>
                      {item.emoji || "📦"} {item.product_name}
                    </span>
                    <b>
                      {displayAmount(
                        item.requested_amount,
                        item.requested_unit,
                      )}
                    </b>
                  </div>
                ))}
              </OrderCard>
            ))}
          {orders.every((order) => order.inventory_logged_at) && (
            <Empty text="Todas as saídas visíveis já foram lançadas." />
          )}
        </>
      )

    if (view === "confirmReturn")
      return (
        <>
          <PageTitle
            title="Conferir retorno"
            text="Janiel: confira o que voltou e registre o fechamento no sistema da empresa."
          />
          {closeouts
            .filter((row) => row.status === "submitted")
            .map((row) => (
              <CloseoutCard
                key={row.id}
                closeout={row}
                supabase={supabase}
                action={confirmCloseout}
                busy={busy}
              />
            ))}
          {closeouts.every((row) => row.status !== "submitted") && (
            <Empty text="Nenhum retorno aguardando conferência." />
          )}
        </>
      )
    return null
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="user-menu">
          <span className="avatar">
            {profile.full_name?.[0]?.toUpperCase() || "?"}
          </span>
          <span>
            <b>{profile.full_name}</b>
            <small>
              {roleNames[profile.role]}
              {profile.sector_id ? ` · ${sectorLabel(profile.sector_id)}` : ""}
            </small>
          </span>
          <button className="text-button" onClick={logout}>
            Sair
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <p className="eyebrow">MENU</p>
          {nav.map(([id, label]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
          <button className="nav-item" onClick={loadData}>
            ↻ Atualizar
          </button>
        </aside>
        <section className="content">
          <nav className="primary-shortcuts" aria-label="Navegação principal">
            {nav.map(([id, label]) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => setView(id)}
              >
                {id === "request" ? `＋ ${label}` : label}
              </button>
            ))}
          </nav>
          {notice && <div className="notice">{notice}</div>}
          {renderView()}
        </section>
      </div>
    </main>
  )
}

function ProductRow({
  product,
  amount,
  unit,
  label,
  keyId,
  field = "amount",
  quantityFor,
  setQty,
  unitsFor,
}) {
  const allowed = unitsFor(product)
  return (
    <div className="product-row">
      <div className="product-image">{product.emoji || "📦"}</div>
      <div className="product-name">
        <b>{product.product_name || product.name}</b>
        <small>{label || product.category || "Produto do setor"}</small>
      </div>
      <div className="quantity-control">
        <input
          aria-label={`Quantidade de ${product.product_name || product.name}`}
          inputMode="decimal"
          type="text"
          placeholder="0"
          value={quantityFor(keyId, field, amount, unit)}
          onChange={(event) => setQty(keyId, field, event.target.value)}
        />
        <select
          aria-label="Unidade"
          value={quantityFor(keyId, "unit", unit || allowed[0])}
          onChange={(event) => setQty(keyId, "unit", event.target.value)}
        >
          {allowed.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function OrderCard({
  order,
  action,
  actionText,
  children,
  sectorLabel,
  user,
  profile,
  busy,
}) {
  return (
    <article className="card order-card">
      <div className="order-head">
        <div>
          <span className="eyebrow">
            {sectorLabel(order.sector_id)} · {order.order_code}
          </span>
          <h3>{order.requester_name}</h3>
        </div>
        <span className={`status status-${order.status}`}>
          {statusNames[order.status]}
        </span>
      </div>
      <p className="muted small">
        Pedido criado em {localTime(order.created_at)}
      </p>
      {children}
      <div className="order-foot">
        {order.inventory_logged_at ? (
          <span className="small success-text">
            Saída lançada por{" "}
            {order.inventory_logged_by === user.id
              ? profile.full_name
              : "responsável"}
          </span>
        ) : (
          <span className="small muted">Lançamento do estoque pendente</span>
        )}
        {action && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => action(order)}
          >
            {actionText}
          </button>
        )}
      </div>
    </article>
  )
}

function PageTitle({ title, text }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">PEDIDO FÁCIL</p>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
      </div>
    </div>
  )
}
function Empty({ text }) {
  return (
    <div className="empty card">
      <span>✓</span>
      <h2>Tudo em dia</h2>
      <p>{text}</p>
    </div>
  )
}

function CloseoutCard({ closeout, supabase, action, busy }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    supabase
      .from("closeout_items")
      .select("*")
      .eq("closeout_id", closeout.id)
      .then(({ data }) => setRows(data || []))
  }, [closeout.id, supabase])
  return (
    <article className="card order-card">
      <div className="order-head">
        <div>
          <span className="eyebrow">
            {closeout.sector?.name} · {closeout.order?.order_code}
          </span>
          <h3>Retorno de {closeout.order?.requester_name}</h3>
        </div>
        <span className="status status-return_submitted">
          Aguardando conferência
        </span>
      </div>
      <p className="small muted">Enviado em {localTime(closeout.created_at)}</p>
      {rows.map((item) => (
        <div className="simple-item" key={item.id}>
          <span>
            {item.emoji || "📦"} {item.product_name}
          </span>
          <span>
            Voltou: <b>{displayAmount(item.return_amount, item.return_unit)}</b>{" "}
            · Avaria:{" "}
            <b>{displayAmount(item.damage_amount, item.damage_unit)}</b>
          </span>
        </div>
      ))}
      <div className="order-foot">
        <span className="small muted">
          A confirmação registra também o lançamento do retorno.
        </span>
        <button
          className="primary"
          disabled={busy}
          onClick={() => action(closeout)}
        >
          Confirmar retorno e lançamento
        </button>
      </div>
    </article>
  )
}
