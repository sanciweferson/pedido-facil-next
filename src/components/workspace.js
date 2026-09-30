"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Brand from "@/components/brand";

const roleNames = { requester: "Solicitante", separator: "Separação", inventory: "Estoque", admin: "Administrador" };
const statusNames = { requested: "Aguardando separação", separated: "Separado", received: "Recebido", return_submitted: "Retorno aguardando conferência", closed: "Concluído" };
const unitsByType = { weight: ["g", "kg"], volume: ["ml", "L"], count: ["un"] };
const factors = { g: 1, kg: 1000, ml: 1, L: 1000, un: 1 };
const navByRole = {
  requester: [["home", "Acompanhar pedidos"], ["request", "Fazer pedido"], ["receive", "Confirmar recebimento"], ["close", "Retorno e avarias"], ["reports", "Relatórios"]],
  separator: [["home", "Acompanhar pedidos"], ["separate", "Separar pedidos"], ["reports", "Relatórios"]],
  inventory: [["home", "Acompanhar pedidos"], ["inventory", "Lançar saída"], ["confirmReturn", "Conferir retorno"], ["reports", "Relatórios"]],
  admin: [["home", "Acompanhar pedidos"], ["request", "Fazer pedido"], ["separate", "Separar pedidos"], ["receive", "Confirmar recebimento"], ["close", "Retorno e avarias"], ["inventory", "Lançar saída"], ["confirmReturn", "Conferir retorno"], ["reports", "Relatórios"]],
};

function localTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function parseAmount(value) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return 0;
  return Number(normalized);
}

function toBase(amount, unit) {
  const numeric = parseAmount(amount);
  return Number.isFinite(numeric) ? numeric * (factors[unit] || 1) : 0;
}

function displayAmount(amount, unit) {
  if (amount === null || amount === undefined) return "—";
  let value = Number(amount);
  let shownUnit = unit;
  if (unit === "g" && value >= 1000) { value /= 1000; shownUnit = "kg"; }
  if (unit === "kg" && value > 0 && value < 1) { value *= 1000; shownUnit = "g"; }
  if (unit === "ml" && value >= 1000) { value /= 1000; shownUnit = "L"; }
  if (unit === "L" && value > 0 && value < 1) { value *= 1000; shownUnit = "ml"; }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${shownUnit || ""}`.trim();
}

function groupItemsByCategory(rows = []) {
  const groups = new Map();
  for (const item of rows) {
    const category = item.product?.category || item.order_item?.product?.category || item.category || "Geral";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
}

function saoPauloDateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

function saoPauloDayStart(dateText) {
  return new Date(`${dateText}T00:00:00-03:00`);
}

function nextSaoPauloDayStart(dateText) {
  const nextDay = saoPauloDayStart(dateText);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay;
}

async function fetchAllPages(makeQuery) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

async function fetchRowsForIds(supabase, table, foreignKey, ids) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const result = await fetchAllPages(() => supabase.from(table).select("*").in(foreignKey, batch));
    if (result.error) return result;
    rows.push(...result.data);
  }
  return { data: rows, error: null };
}

function ProductRow({ product, amount, unit, label, keyId, field = "amount", unitsFor, quantityFor, setQty }) {
  const allowed = unitsFor(product);
  return <div className="product-row"><div className="product-image">{product.emoji || "📦"}</div><div className="product-name"><b>{product.product_name || product.name}</b><small>{label || product.category || "Produto do setor"}</small></div><div className="quantity-control"><input aria-label={`Quantidade de ${product.product_name || product.name}`} inputMode="decimal" type="text" placeholder="0" value={quantityFor(keyId, field, amount, unit)} onChange={e => setQty(keyId, "amount", e.target.value)} /><select aria-label="Unidade" value={quantityFor(keyId, "unit", unit || allowed[0])} onChange={e => setQty(keyId, "unit", e.target.value)}>{allowed.map(option => <option key={option}>{option}</option>)}</select></div></div>;
}

function OrderCard({ order, action, actionText, children, sectorLabel, user, profile, busy }) {
  return <article className="card order-card"><div className="order-head"><div><span className="eyebrow">{sectorLabel(order.sector_id)} · {order.order_code}</span><h3>{order.requester_name}</h3></div><span className={`status status-${order.status}`}>{statusNames[order.status]}</span></div><p className="muted small">Pedido criado em {localTime(order.created_at)}</p>{children}<div className="order-foot">{order.inventory_logged_at ? <span className="small success-text">Saída lançada por {order.inventory_logged_by === user.id ? profile.full_name : "responsável"}</span> : <span className="small muted">Lançamento do estoque pendente</span>}{action && <button className="primary" disabled={busy} onClick={() => action(order)}>{actionText}</button>}</div></article>;
}

export default function Workspace({ user, initialProfile }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile] = useState(initialProfile);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [avatarUrl, setAvatarUrl] = useState(user.user_metadata?.avatar_url || "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef(null);
  const [view, setView] = useState("home");
  const [sectors, setSectors] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [closeouts, setCloseouts] = useState([]);
  const [selectedCloseOrder, setSelectedCloseOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [workflowAlert, setWorkflowAlert] = useState(null);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [sectorId, setSectorId] = useState(profile.sector_id || "");
  const [openProductCategory, setOpenProductCategory] = useState("");
  const [quantities, setQuantities] = useState({});
  const [selectedSectorFilter, setSelectedSectorFilter] = useState("all");
  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");
  const loadDataRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const workflowAlertTimerRef = useRef(null);
  const ordersSnapshotRef = useRef([]);
  const sectorsSnapshotRef = useRef([]);
  const notificationRegistrationRef = useRef(null);
  const [reportStart, setReportStart] = useState(saoPauloDateInput());
  const [reportEnd, setReportEnd] = useState(saoPauloDateInput());
  const [reportSectorId, setReportSectorId] = useState("all");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportOrders, setReportOrders] = useState([]);
  const [reportItems, setReportItems] = useState([]);
  const [reportCloseouts, setReportCloseouts] = useState([]);
  const [reportCloseoutItems, setReportCloseoutItems] = useState([]);

  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = window.localStorage.getItem("pedido-facil-theme");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = value => {
      setTheme(value);
      root.dataset.theme = value;
    };
    applyTheme(savedTheme || (media.matches ? "dark" : "light"));
    if (savedTheme) return undefined;
    const followDeviceTheme = event => {
      if (!window.localStorage.getItem("pedido-facil-theme")) applyTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener?.("change", followDeviceTheme);
    return () => media.removeEventListener?.("change", followDeviceTheme);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeOnEscape = event => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [profileMenuOpen]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("pedido-facil-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return flash("Escolha um arquivo de imagem.");
    if (file.size > 5 * 1024 * 1024) return flash("A foto precisa ter no máximo 5 MB.");
    if (!supabase) return flash("Supabase não está configurado.");
    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const path = `${user.id}/avatar.${extension}`;
    setAvatarBusy(true);
    const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });
    if (uploadError) {
      setAvatarBusy(false);
      return flash(uploadError.message.includes("row-level security") ? "Execute a configuração de fotos no SQL Editor do Supabase e tente novamente." : uploadError.message);
    }
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    const nextUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { error: profileError } = await supabase.auth.updateUser({ data: { avatar_url: nextUrl } });
    setAvatarBusy(false);
    if (profileError) return flash(profileError.message);
    setAvatarUrl(nextUrl);
    flash("Foto de perfil atualizada.");
  }

  async function loadData() {
    if (!supabase) return;
    const [{ data: sectorRows }, { data: productRows }, { data: orderRows }, { data: closeoutRows }] = await Promise.all([
      supabase.from("sectors").select("id,name,slug").order("name"),
      supabase.from("products").select("id,sector_id,name,category,unit_type,emoji").eq("is_active", true).order("name"),
      supabase.from("orders").select("*, sector:sectors(name)").order("created_at", { ascending: false }).limit(60),
      supabase.from("closeouts").select("*, sector:sectors(name), order:orders(order_code,requester_name)").order("created_at", { ascending: false }).limit(40),
    ]);
    setSectors(sectorRows || []);
    sectorsSnapshotRef.current = sectorRows || [];
    setProducts(productRows || []);
    ordersSnapshotRef.current = orderRows || [];
    setOrders(orderRows || []);
    setCloseouts(closeoutRows || []);
    const ids = (orderRows || []).map(order => order.id);
    if (ids.length) {
      const { data: itemRows } = await supabase.from("order_items").select("*, product:products(category)").in("order_id", ids).order("created_at");
      setItems(itemRows || []);
    } else setItems([]);
  }

  loadDataRef.current = loadData;

  function showWorkflowAlert(title, body, tag) {
    setWorkflowAlert({ title, body });
    window.clearTimeout(workflowAlertTimerRef.current);
    workflowAlertTimerRef.current = window.setTimeout(() => setWorkflowAlert(null), 7000);

    if ("Notification" in window && "serviceWorker" in navigator && Notification.permission === "granted") {
      const registrationPromise = notificationRegistrationRef.current
        ? Promise.resolve(notificationRegistrationRef.current)
        : navigator.serviceWorker.ready;
      registrationPromise.then(registration => registration.showNotification(title, {
        body,
        icon: "/pedido-facil-notification.svg",
        badge: "/pedido-facil-notification.svg",
        tag,
        data: { url: "/dashboard" },
        timestamp: Date.now(),
        vibrate: [120, 70, 120],
        renotify: true,
      })).catch(error => console.warn("Não foi possível mostrar a notificação:", error));
    }
    if (document.visibilityState === "visible" && "vibrate" in navigator) {
      navigator.vibrate([120, 70, 120]);
    }
  }

  function handleOrderChange(payload) {
    const order = payload.new || {};
    const previous = payload.old?.status !== undefined ? payload.old : ordersSnapshotRef.current.find(row => row.id === order.id) || {};
    const sectorName = sectorsSnapshotRef.current.find(row => row.id === order.sector_id)?.name || "um setor";
    const code = order.order_code || "Pedido";

    if (payload.eventType === "INSERT" && order.status === "requested") {
      if (["separator", "inventory", "admin"].includes(profile.role)) {
        showWorkflowAlert(`${sectorName} · Novo pedido`, `${code} de ${order.requester_name || "um solicitante"} aguarda separação.`, `order-${order.id}-requested`);
      }
      return;
    }

    if (payload.eventType !== "UPDATE") return;
    if (order.status === "separated" && previous.status !== "separated" && order.requester_id === user.id) {
      showWorkflowAlert(`${sectorName} · Pedido separado`, `${code} está pronto. Confira os itens recebidos.`, `order-${order.id}-separated`);
    }
    if (order.status === "received" && previous.status !== "received" && ["separator", "admin"].includes(profile.role)) {
      showWorkflowAlert(`${sectorName} · Recebimento confirmado`, `${order.requester_name || "O solicitante"} confirmou o recebimento de ${code}.`, `order-${order.id}-received`);
    }
    if (order.status === "return_submitted" && previous.status !== "return_submitted" && ["inventory", "admin"].includes(profile.role)) {
      showWorkflowAlert(`${sectorName} · Retorno para conferir`, `${order.requester_name || "O solicitante"} enviou o fechamento de ${code}. Confira sobras e avarias.`, `order-${order.id}-return`);
    }
    if (order.status === "closed" && previous.status !== "closed" && order.requester_id === user.id) {
      showWorkflowAlert(`${sectorName} · Retorno concluído`, `O retorno de ${code} foi conferido.`, `order-${order.id}-closed`);
    }
    if (order.inventory_logged_at && !previous.inventory_logged_at && order.requester_id === user.id) {
      showWorkflowAlert(`${sectorName} · Saída lançada`, `A saída de ${code} foi registrada no estoque.`, `order-${order.id}-inventory`);
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      flash("Este navegador não oferece suporte a notificações do sistema.");
      return;
    }
    try {
      if (Notification.permission === "granted") {
        const registration = notificationRegistrationRef.current || await navigator.serviceWorker.ready;
        notificationRegistrationRef.current = registration;
        await registration.showNotification("Pedido Fácil · teste de alerta", {
          body: "As notificações deste dispositivo estão funcionando.",
          icon: "/pedido-facil-notification.svg",
          badge: "/pedido-facil-notification.svg",
          tag: "pedido-facil-test",
          data: { url: "/dashboard" },
        });
        flash("Notificação de teste enviada para este dispositivo.");
        return;
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        notificationRegistrationRef.current = await navigator.serviceWorker.register("/sw.js");
        await notificationRegistrationRef.current.showNotification("Pedido Fácil · alertas ativados", {
          body: "Este dispositivo está pronto para receber notificações.",
          icon: "/pedido-facil-notification.svg",
          badge: "/pedido-facil-notification.svg",
          tag: "pedido-facil-test",
          data: { url: "/dashboard" },
        });
        flash("Alertas ativados. Enviamos uma notificação de teste.");
      } else if (permission === "denied") {
        flash("Notificações bloqueadas. Libere a permissão do site nas configurações do navegador.");
      } else {
        flash("Permita as notificações para receber alertas do sistema.");
      }
    } catch (error) {
      flash(`Não foi possível ativar os alertas: ${error.message}`);
    }
  }

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    if ("Notification" in window && "serviceWorker" in navigator) {
      setNotificationSupported(true);
      setNotificationPermission(Notification.permission);
      navigator.serviceWorker.register("/sw.js")
        .then(registration => { notificationRegistrationRef.current = registration; })
        .catch(error => console.warn("Service worker indisponível:", error));
    }
    const refreshSoon = () => {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        if (active) loadDataRef.current?.();
      }, 180);
    };
    const channel = supabase
      .channel("pedido-facil-workspace")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, payload => {
        handleOrderChange(payload);
        refreshSoon();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "closeouts" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "closeout_items" }, refreshSoon)
      .subscribe(status => {
        if (!active) return;
        setRealtimeStatus(status);
        if (status === "SUBSCRIBED") refreshSoon();
      });

    // Atualização de segurança quando o celular volta para a tela ou recupera a conexão.
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshSoon();
    };
    window.addEventListener("online", refreshSoon);
    window.addEventListener("focus", refreshSoon);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const fallbackInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadDataRef.current?.();
    }, 30000);
    loadData();

    return () => {
      active = false;
      window.clearTimeout(refreshTimerRef.current);
      window.clearTimeout(workflowAlertTimerRef.current);
      window.clearInterval(fallbackInterval);
      window.removeEventListener("online", refreshSoon);
      window.removeEventListener("focus", refreshSoon);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function loadReportData(event) {
    event?.preventDefault();
    if (!reportStart || !reportEnd || reportStart > reportEnd) {
      return flash("Escolha um período válido. A data inicial deve ser anterior à final.");
    }
    setReportBusy(true);
    const from = saoPauloDayStart(reportStart).toISOString();
    const until = nextSaoPauloDayStart(reportEnd).toISOString();
    const [ordersResult, closeoutsResult] = await Promise.all([
      fetchAllPages(() => supabase.from("orders").select("*, sector:sectors(name)").gte("created_at", from).lt("created_at", until).order("created_at", { ascending: false }).order("id")),
      fetchAllPages(() => supabase.from("closeouts").select("*, sector:sectors(name), order:orders(order_code, requester_name, created_at)").gte("created_at", from).lt("created_at", until).order("created_at", { ascending: false }).order("id")),
    ]);
    if (ordersResult.error || closeoutsResult.error) {
      setReportBusy(false);
      return flash(`Não foi possível gerar o relatório: ${(ordersResult.error || closeoutsResult.error).message}`);
    }
    const orderRows = ordersResult.data;
    const closeoutRows = closeoutsResult.data;
    const orderIds = (orderRows || []).map(row => row.id);
    const closeoutIds = (closeoutRows || []).map(row => row.id);
    const [itemResult, closeoutItemResult] = await Promise.all([
      fetchRowsForIds(supabase, "order_items", "order_id", orderIds),
      fetchRowsForIds(supabase, "closeout_items", "closeout_id", closeoutIds),
    ]);
    setReportBusy(false);
    if (itemResult.error || closeoutItemResult.error) return flash(`Não foi possível carregar os itens do relatório: ${(itemResult.error || closeoutItemResult.error).message}`);
    setReportOrders(orderRows || []);
    setReportItems((itemResult.data || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    setReportCloseouts(closeoutRows || []);
    setReportCloseoutItems(closeoutItemResult.data || []);
  }

  function flash(text) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 4500);
  }

  function setQty(key, field, value) {
    setQuantities(current => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }

  function unitsFor(product) { return unitsByType[product?.unit_type] || ["un"]; }
  function quantityFor(key, field, fallback, unitFallback) {
    return quantities[key]?.[field] ?? fallback ?? "";
  }

  async function submitOrder(event) {
    event.preventDefault();
    const selectedProducts = products.filter(product => product.sector_id === sectorId && parseAmount(quantities[product.id]?.amount) > 0);
    if (!selectedProducts.length) return flash("Escolha pelo menos um produto e informe a quantidade.");
    setBusy(true);
    const sector = sectors.find(row => row.id === sectorId);
    const { data: order, error } = await supabase.from("orders").insert({
      sector_id: sectorId,
      requester_id: user.id,
      requester_name: profile.full_name,
      status: "requested",
      order_code: `PED-${Date.now().toString().slice(-6)}`,
    }).select().single();
    if (error) { setBusy(false); return flash(error.message); }
    const orderItems = selectedProducts.map(product => {
      const value = parseAmount(quantities[product.id].amount);
      const unit = quantities[product.id].unit || unitsFor(product)[0];
      return { order_id: order.id, product_id: product.id, product_name: product.name, emoji: product.emoji, unit_type: product.unit_type, requested_amount: value, requested_unit: unit, requested_base: toBase(value, unit) };
    });
    const { error: itemError } = await supabase.from("order_items").insert(orderItems);
    if (itemError) {
      await supabase.from("orders").delete().eq("id", order.id);
      setBusy(false);
      return flash(itemError.message);
    }
    setBusy(false);
    setQuantities({});
    await loadData();
    setView("home");
    flash(`Pedido enviado para ${sector?.name}.`);
  }

  async function setOrderItems(order, field, fallbackField) {
    for (const item of items.filter(row => row.order_id === order.id)) {
      const key = `${order.id}:${item.id}`;
      const value = parseAmount(quantities[key]?.amount ?? item[fallbackField] ?? item.requested_amount);
      const unit = quantities[key]?.unit ?? item[`${fallbackField.replace("amount", "unit")}`] ?? item.requested_unit;
      if (!Number.isFinite(value) || value < 0) throw new Error(`Digite uma quantidade válida para ${item.product_name}.`);
      const { error } = await supabase.from("order_items").update({ [`${field}_amount`]: value, [`${field}_unit`]: unit, [`${field}_base`]: toBase(value, unit) }).eq("id", item.id);
      if (error) throw error;
    }
  }

  async function confirmSeparation(order) {
    setBusy(true);
    try {
      await setOrderItems(order, "separated", "requested_amount");
      const { error } = await supabase.from("orders").update({ status: "separated", separated_by: user.id, separated_at: new Date().toISOString() }).eq("id", order.id);
      if (error) throw error;
      await loadData();
      flash("Separação confirmada.");
    } catch (error) { flash(error.message); }
    setBusy(false);
  }

  async function confirmReceipt(order) {
    setBusy(true);
    try {
      await setOrderItems(order, "received", "separated_amount");
      const { error } = await supabase.from("orders").update({ status: "received", received_by: user.id, received_at: new Date().toISOString() }).eq("id", order.id);
      if (error) throw error;
      await loadData();
      flash("Recebimento confirmado.");
    } catch (error) { flash(error.message); }
    setBusy(false);
  }

  function reviewCloseout(order) {
    setSelectedCloseOrder(order);
    setView("reviewClose");
  }

  function closeoutDraftRows(order) {
    return items.filter(item => item.order_id === order.id).map(item => {
      const row = quantities[`close:${item.id}`] || {};
      const returnAmount = parseAmount(row.returnAmount ?? 0);
      const returnUnit = row.returnUnit || item.received_unit || item.requested_unit;
      const damageAmount = parseAmount(row.damageAmount ?? 0);
      const damageUnit = row.damageUnit || item.received_unit || item.requested_unit;
      return {
        ...item,
        returnAmount,
        returnUnit,
        returnBase: toBase(returnAmount, returnUnit),
        damageAmount,
        damageUnit,
        damageBase: toBase(damageAmount, damageUnit),
      };
    });
  }

  async function submitCloseout() {
    const order = selectedCloseOrder;
    if (!order) return;
    const draftRows = closeoutDraftRows(order);
    for (const item of draftRows) {
      if (!Number.isFinite(item.returnAmount) || item.returnAmount < 0 || !Number.isFinite(item.damageAmount) || item.damageAmount < 0) {
        return flash(`Digite quantidades válidas para ${item.product_name}.`);
      }
      const receivedBase = Number(item.received_base ?? toBase(item.received_amount, item.received_unit));
      if (item.returnBase + item.damageBase > receivedBase) {
        return flash(`Retorno + avaria de ${item.product_name} não podem superar o que foi recebido.`);
      }
    }
    const rowsToSend = draftRows.filter(item => item.returnBase > 0 || item.damageBase > 0);
    if (!rowsToSend.length) return flash("Informe pelo menos uma sobra ou avaria. Itens com quantidade zero não serão enviados.");
    setBusy(true);
    const { data: closeout, error } = await supabase.from("closeouts").insert({ order_id: order.id, sector_id: order.sector_id, submitted_by: user.id, status: "submitted" }).select().single();
    if (error) { setBusy(false); return flash(error.message); }
    const closeoutItems = rowsToSend.map(item => ({ closeout_id: closeout.id, order_item_id: item.id, product_name: item.product_name, emoji: item.emoji, return_amount: item.returnAmount, return_unit: item.returnUnit, return_base: item.returnBase, damage_amount: item.damageAmount, damage_unit: item.damageUnit, damage_base: item.damageBase }));
    const { error: rowsError } = await supabase.from("closeout_items").insert(closeoutItems);
    if (rowsError) {
      await supabase.from("closeouts").delete().eq("id", closeout.id);
      setBusy(false);
      return flash(rowsError.message);
    }
    const { error: orderError } = await supabase.from("orders").update({ status: "return_submitted" }).eq("id", order.id);
    setBusy(false);
    if (orderError) return flash(orderError.message);
    await loadData();
    setView("home");
    setSelectedCloseOrder(null);
    flash("Fechamento enviado ao Janiel para conferência.");
  }

  async function markInventory(order) {
    setBusy(true);
    const { error } = await supabase.from("orders").update({ inventory_logged_by: user.id, inventory_logged_at: new Date().toISOString() }).eq("id", order.id);
    setBusy(false);
    if (error) return flash(error.message);
    await loadData();
    flash("Saída marcada como lançada no sistema da empresa.");
  }

  async function confirmCloseout(closeout) {
    const relatedOrder = orders.find(order => order.id === closeout.order_id);
    if (!relatedOrder?.inventory_logged_at) return flash("Janiel: registre primeiro a saída no sistema da empresa.");
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("closeouts").update({ status: "confirmed", confirmed_by: user.id, confirmed_at: now, inventory_logged_by: user.id, inventory_logged_at: now }).eq("id", closeout.id);
    if (!error) await supabase.from("orders").update({ status: "closed" }).eq("id", closeout.order_id);
    setBusy(false);
    if (error) return flash(error.message);
    await loadData();
    flash("Retorno conferido e lançamento registrado.");
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const nav = navByRole[profile.role] || navByRole.requester;
  const visibleOrders = selectedSectorFilter === "all" ? orders : orders.filter(order => order.sector_id === selectedSectorFilter);
  const itemsFor = order => items.filter(item => item.order_id === order.id);
  const sectorLabel = id => sectors.find(row => row.id === id)?.name || "Setor";
  const reportOrderRows = reportSectorId === "all" ? reportOrders : reportOrders.filter(order => order.sector_id === reportSectorId);
  const reportCloseoutRows = reportSectorId === "all" ? reportCloseouts : reportCloseouts.filter(row => row.sector_id === reportSectorId);
  const requestProductGroups = products
    .filter(product => product.sector_id === sectorId)
    .reduce((groups, product) => {
      const category = product.category || "Geral";
      (groups[category] ||= []).push(product);
      return groups;
    }, {});
  const sortedRequestProductGroups = Object.entries(requestProductGroups)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"));

  const sharedCardProps = { sectorLabel, user, profile, busy };
  const sharedProductProps = { unitsFor, quantityFor, setQty };

  function renderView() {
    if (view === "home") return <>
      <div className="page-heading"><div><p className="eyebrow">PAINEL DO SETOR</p><h1>Acompanhar pedidos</h1><p className="muted">Veja o andamento e quem está com cada etapa.</p></div></div>
      <div className="sector-filter"><button className={`filter-chip ${selectedSectorFilter === "all" ? "selected" : ""}`} onClick={() => setSelectedSectorFilter("all")}>Todos os setores</button>{sectors.map(sector => <button className={`filter-chip ${selectedSectorFilter === sector.id ? "selected" : ""}`} key={sector.id} onClick={() => setSelectedSectorFilter(sector.id)}>{sector.name}</button>)}</div>
      <section className="stack">{visibleOrders.length ? visibleOrders.map(order => <OrderCard {...sharedCardProps} key={order.id} order={order}><div className="timeline"><span className="done">Pedido enviado</span><span className={order.status !== "requested" ? "done" : "current"}>Separação</span><span className={["received", "return_submitted", "closed"].includes(order.status) ? "done" : "current"}>Recebimento</span></div><div className="order-items-summary" aria-label="Itens do pedido">{itemsFor(order).map(item => <div className="order-item-summary" key={item.id}><span><i>{item.emoji || "📦"}</i>{item.product_name}</span><b>{displayAmount(item.requested_amount, item.requested_unit)}</b></div>)}</div></OrderCard>) : <div className="empty card"><span>🧾</span><h2>Nenhum pedido por aqui</h2><p>Quando um pedido for criado, o andamento aparece nesta tela.</p></div>}</section>
    </>;

    if (view === "reports") return <>
      <div className="page-heading report-heading"><div><p className="eyebrow">CONTROLE DE ESTOQUE</p><h1>Relatórios</h1><p className="muted">Consulte pedidos, quantidades recebidas, retornos e avarias por período.</p></div><button className="secondary no-print" onClick={() => window.print()} disabled={reportBusy || (!reportOrders.length && !reportCloseouts.length)}>Imprimir / salvar PDF</button></div>
      <form className="card report-filters no-print" onSubmit={loadReportData}>
        <label>De<input type="date" value={reportStart} onChange={event => setReportStart(event.target.value)} required /></label>
        <label>Até<input type="date" value={reportEnd} onChange={event => setReportEnd(event.target.value)} required /></label>
        <label>Setor<select value={reportSectorId} onChange={event => setReportSectorId(event.target.value)}><option value="all">Todos os setores</option>{sectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
        <button className="primary" disabled={reportBusy}>{reportBusy ? "Gerando…" : "Gerar relatório"}</button>
      </form>
      <div className="report-print-title"><Brand /><p>Período: {reportStart} a {reportEnd} · Setor: {reportSectorId === "all" ? "Todos" : sectorLabel(reportSectorId)}</p></div>
      <section className="card report-section"><div className="section-title"><h2>Pedidos do período</h2><span>{reportOrderRows.length} pedidos</span></div>
        {reportOrderRows.length ? reportOrderRows.map(order => <article className="report-record" key={order.id}><div className="report-record-head"><div><b>{order.order_code}</b><span>{order.sector?.name || sectorLabel(order.sector_id)} · {order.requester_name}</span></div><span>{localTime(order.created_at)} · {statusNames[order.status]}</span></div>
          {(reportItems.filter(item => item.order_id === order.id)).map(item => <div className="report-line" key={item.id}><span>{item.emoji || "📦"} {item.product_name}</span><span>Pedido: <b>{displayAmount(item.requested_amount, item.requested_unit)}</b></span><span>Separado: <b>{displayAmount(item.separated_amount, item.separated_unit)}</b></span><span>Recebido: <b>{displayAmount(item.received_amount, item.received_unit)}</b></span></div>)}
        </article>) : <p className="muted report-empty">Gere o relatório para ver os pedidos deste período.</p>}
      </section>
      <section className="card report-section"><div className="section-title"><h2>Retornos e avarias</h2><span>{reportCloseoutRows.length} fechamentos</span></div>
        {reportCloseoutRows.length ? reportCloseoutRows.map(row => <article className="report-record" key={row.id}><div className="report-record-head"><div><b>{row.order?.order_code || "Pedido"}</b><span>{row.sector?.name || sectorLabel(row.sector_id)} · Retorno de {row.order?.requester_name || "solicitante"}</span></div><span>{localTime(row.created_at)} · {row.status === "confirmed" ? "Conferido" : "Aguardando conferência"}</span></div>
          {reportCloseoutItems.filter(item => item.closeout_id === row.id).map(item => <div className="report-line" key={item.id}><span>{item.emoji || "📦"} {item.product_name}</span><span>Voltou: <b>{displayAmount(item.return_amount, item.return_unit)}</b></span><span>Avaria: <b>{displayAmount(item.damage_amount, item.damage_unit)}</b></span></div>)}
        </article>) : <p className="muted report-empty">Nenhum retorno ou avaria encontrado no período selecionado.</p>}
      </section>
    </>;

    if (view === "request") return <><div className="page-heading"><div><p className="eyebrow">NOVA REQUISIÇÃO</p><h1>Fazer pedido</h1><p className="muted">Seu nome e o horário ficam registrados automaticamente.</p></div></div><form className="card form-card" onSubmit={submitOrder}><label>Setor<select value={sectorId} onChange={e => { setSectorId(e.target.value); setOpenProductCategory(""); }} disabled={profile.role === "requester" && Boolean(profile.sector_id)} required>{sectors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="section-title"><h2>Produtos do setor</h2><span>{products.filter(item => item.sector_id === sectorId).length} itens</span></div><div className="product-categories">{sortedRequestProductGroups.map(([category, categoryProducts], index) => { const groupKey = `${sectorId}:${category}`; const isOpen = openProductCategory === groupKey; const panelId = `product-category-${index}`; return <section className={`product-category ${isOpen ? "open" : ""}`} key={groupKey}><button type="button" className="product-category-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenProductCategory(isOpen ? "" : groupKey)}><span className="product-category-label">{category}<small>{categoryProducts.length} {categoryProducts.length === 1 ? "produto" : "produtos"}</small></span><span className="product-category-chevron" aria-hidden="true">⌄</span></button>{isOpen && <div id={panelId} className="product-category-items">{categoryProducts.map(product => <ProductRow {...sharedProductProps} key={product.id} product={product} keyId={product.id} amount="" unit={unitsFor(product)[0]} />)}</div>}</section>; })}</div><div className="helper">As porções prontas são contadas por unidade. Para os demais itens, escolha g, kg, ml, L ou un.</div><button className="primary full" disabled={busy}>{busy ? "Enviando…" : "Enviar pedido"}</button></form></>;

    if (view === "separate") return <><PageTitle title="Pedidos para separar" text="Douglas: confira os itens e informe o que conseguiu separar." />{orders.filter(order => order.status === "requested").map(order => <OrderCard {...sharedCardProps} key={order.id} order={order} action={confirmSeparation} actionText="Confirmar separação">{groupItemsByCategory(itemsFor(order)).map(([category, categoryItems]) => <details className="category-accordion" key={category}><summary><span>{category}<small>{categoryItems.length} {categoryItems.length === 1 ? "produto" : "produtos"}</small></span><i aria-hidden="true">⌄</i></summary><div className="category-accordion-content">{categoryItems.map(item => <ProductRow {...sharedProductProps} key={item.id} product={item} keyId={`${order.id}:${item.id}`} field="amount" amount={item.requested_amount} unit={item.requested_unit} label={`Solicitado: ${displayAmount(item.requested_amount, item.requested_unit)}`} />)}</div></details>)}</OrderCard>)}{orders.every(order => order.status !== "requested") && <Empty text="Não há pedidos aguardando separação." />}</>;

    if (view === "receive") return <><PageTitle title="Confirmar recebimento" text="Confira o que chegou antes de confirmar." />{orders.filter(order => order.status === "separated" && order.requester_id === user.id).map(order => <OrderCard {...sharedCardProps} key={order.id} order={order} action={confirmReceipt} actionText="Confirmar recebimento">{itemsFor(order).map(item => <ProductRow {...sharedProductProps} key={item.id} product={item} keyId={`${order.id}:${item.id}`} amount={item.separated_amount} unit={item.separated_unit} label={`Separado: ${displayAmount(item.separated_amount, item.separated_unit)}`} />)}</OrderCard>)}{orders.every(order => order.status !== "separated" || order.requester_id !== user.id) && <Empty text="Você não tem pedidos separados aguardando confirmação." />}</>;

    if (view === "close") return <><PageTitle title="Retorno e avarias" text="Informe o que sobrou e o que foi perdido ou danificado." />{orders.filter(order => order.status === "received" && order.requester_id === user.id).map(order => <OrderCard {...sharedCardProps} key={order.id} order={order} action={reviewCloseout} actionText="Revisar fechamento">{itemsFor(order).map(item => <div className="close-row" key={item.id}><div className="product-image">{item.emoji || "📦"}</div><b>{item.product_name}</b><label>Retorno <input type="text" inputMode="decimal" placeholder="0" value={quantities[`close:${item.id}`]?.returnAmount ?? 0} onChange={e => setQty(`close:${item.id}`, "returnAmount", e.target.value)} /></label><select value={quantities[`close:${item.id}`]?.returnUnit || item.received_unit || item.requested_unit} onChange={e => setQty(`close:${item.id}`, "returnUnit", e.target.value)}>{unitsFor(item).map(unit => <option key={unit}>{unit}</option>)}</select><label>Avaria <input type="text" inputMode="decimal" placeholder="0" value={quantities[`close:${item.id}`]?.damageAmount ?? 0} onChange={e => setQty(`close:${item.id}`, "damageAmount", e.target.value)} /></label><select value={quantities[`close:${item.id}`]?.damageUnit || item.received_unit || item.requested_unit} onChange={e => setQty(`close:${item.id}`, "damageUnit", e.target.value)}>{unitsFor(item).map(unit => <option key={unit}>{unit}</option>)}</select></div>)}</OrderCard>)}{orders.every(order => order.status !== "received" || order.requester_id !== user.id) && <Empty text="Não há pedidos recebidos aguardando fechamento." />}</>;

    if (view === "reviewClose" && selectedCloseOrder) {
      const previewRows = closeoutDraftRows(selectedCloseOrder).filter(item => item.returnBase > 0 || item.damageBase > 0);
      return <><PageTitle title="Revisar fechamento" text="Confira somente os itens com sobra ou avaria antes de enviar." /><article className="card order-card"><p className="eyebrow">{sectorLabel(selectedCloseOrder.sector_id)} · {selectedCloseOrder.order_code}</p><h2>Solicitante: {profile.full_name}</h2><div className="closeout-accordion-list">{groupItemsByCategory(previewRows).map(([category, categoryItems]) => <details className="category-accordion" key={category}><summary><span>{category}<small>{categoryItems.length} {categoryItems.length === 1 ? "item para conferir" : "itens para conferir"}</small></span><i aria-hidden="true">⌄</i></summary><div className="category-accordion-content">{categoryItems.map(item => <div className="closeout-review-row" key={item.id}><div className="closeout-review-name"><span>{item.emoji || "📦"}</span><b>{item.product_name}</b></div><div className="closeout-amounts">{item.returnBase > 0 && <span className="closeout-amount returned">Voltou <b>{displayAmount(item.returnAmount, item.returnUnit)}</b></span>}{item.damageBase > 0 && <span className="closeout-amount damaged">Avaria <b>{displayAmount(item.damageAmount, item.damageUnit)}</b></span>}</div></div>)}</div></details>)}</div><p className="helper">Itens com retorno e avaria zerados ficam fora do envio. Janiel receberá apenas o que sobrou ou foi descartado.</p><div className="review-actions"><button className="secondary" onClick={() => setView("close")}>Voltar e editar</button><button className="primary" disabled={busy || !previewRows.length} onClick={submitCloseout}>{busy ? "Enviando…" : "Confirmar e enviar ao Janiel"}</button></div></article></>;
    }

    if (view === "inventory") return <><PageTitle title="Lançar saída" text="Janiel: registre a saída no controle de estoque da empresa. Pode lançar antes ou depois da separação." />{orders.filter(order => !order.inventory_logged_at).map(order => <OrderCard {...sharedCardProps} key={order.id} order={order} action={markInventory} actionText="Marcar saída lançada">{groupItemsByCategory(itemsFor(order)).map(([category, categoryItems]) => <details className="category-accordion" key={category}><summary><span>{category}<small>{categoryItems.length} {categoryItems.length === 1 ? "produto" : "produtos"}</small></span><i aria-hidden="true">⌄</i></summary><div className="category-accordion-content">{categoryItems.map(item => <div className="simple-item" key={item.id}><span>{item.emoji || "📦"} {item.product_name}</span><b>{displayAmount(item.requested_amount, item.requested_unit)}</b></div>)}</div></details>)}</OrderCard>)}{orders.every(order => order.inventory_logged_at) && <Empty text="Todas as saídas visíveis já foram lançadas." />}</>;

    if (view === "confirmReturn") return <><PageTitle title="Conferir retorno" text="Janiel: confira o que voltou e registre o fechamento no sistema da empresa." />{closeouts.filter(row => row.status === "submitted").map(row => <CloseoutCard key={row.id} closeout={row} supabase={supabase} action={confirmCloseout} busy={busy} />)}{closeouts.every(row => row.status !== "submitted") && <Empty text="Nenhum retorno aguardando conferência." />}</>;
    return null;
  }

  const realtimeConnected = realtimeStatus === "SUBSCRIBED";
  return <main className={`app-shell ${profile.role === "requester" ? "app-shell-requester" : ""}`}>
    <header className="topbar">
      <Brand />
      <div className="topbar-actions">
        {notificationSupported && <button type="button" className={`notification-toggle ${notificationPermission === "granted" ? "enabled" : ""}`} onClick={enableNotifications} aria-label={notificationPermission === "granted" ? "Testar notificações do dispositivo" : "Ativar notificações do dispositivo"}>{notificationPermission === "granted" ? "Testar alertas" : notificationPermission === "denied" ? "Alertas bloqueados" : "Ativar alertas"}</button>}
        <span className={`sync-indicator ${realtimeConnected ? "online" : "offline"}`} title={`Supabase Realtime: ${realtimeStatus}`}><i />{realtimeConnected ? "Ao vivo" : "Atualizando…"}</span>
        <div className="user-menu"><button type="button" className="profile-menu-trigger" onClick={() => setProfileMenuOpen(true)} aria-label="Abrir perfil e configurações">{avatarUrl ? <img className="avatar" src={avatarUrl} alt="" /> : <span className="avatar">{profile.full_name?.[0]?.toUpperCase() || "?"}</span>}</button></div>
      </div>
    </header>
    <nav className="mobile-top-nav" aria-label="Navegação principal">
      {nav.map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
    </nav>
    {workflowAlert && <div className="workflow-alert" role="status" aria-live="polite"><div><b>{workflowAlert.title}</b><span>{workflowAlert.body}</span></div><button type="button" aria-label="Fechar alerta" onClick={() => setWorkflowAlert(null)}>×</button></div>}
    <div className="workspace">
      <aside className="sidebar"><p className="eyebrow">MENU</p>{nav.map(([id, label]) => <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => setView(id)}>{label}</button>)}<button className="nav-item" onClick={loadData}>↻ Atualizar</button></aside>
      <section className="content">{notice && <div className="notice">{notice}</div>}{renderView()}</section>
    </div>
    {profileMenuOpen && <div className="profile-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProfileMenuOpen(false); }}>
      <aside className="profile-drawer" role="dialog" aria-modal="true" aria-labelledby="profile-drawer-title">
        <div className="profile-drawer-heading"><div><p className="eyebrow">SUA CONTA</p><h2 id="profile-drawer-title">Perfil e preferências</h2></div><button className="drawer-close" type="button" onClick={() => setProfileMenuOpen(false)} aria-label="Fechar menu">×</button></div>
        <div className="profile-details">
          <button type="button" className="profile-photo-button" onClick={() => avatarInputRef.current?.click()} disabled={avatarBusy} aria-label="Alterar foto de perfil">
            {avatarUrl ? <img src={avatarUrl} alt="Foto de perfil" /> : <span>{profile.full_name?.[0]?.toUpperCase() || "?"}</span>}
            <i>{avatarBusy ? "…" : "＋"}</i>
          </button>
          <input ref={avatarInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} />
          <div className="profile-identity"><b>{profile.full_name}</b><span>{user.email || "E-mail não disponível"}</span><small>{roleNames[profile.role]}{profile.sector_id ? ` · ${sectorLabel(profile.sector_id)}` : ""}</small></div>
        </div>
        <p className="profile-photo-hint">Toque na foto para escolher outra imagem (até 5 MB).</p>
        <div className="drawer-divider" />
        <div className="theme-setting"><div><b>Aparência</b><small>{theme === "dark" ? "Tema escuro" : "Tema claro"}</small></div><button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}><span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span><b>{theme === "dark" ? "Escuro" : "Claro"}</b></button></div>
        <button type="button" className="drawer-logout" onClick={logout}>Sair da conta</button>
      </aside>
    </div>}
  </main>;
}

function PageTitle({ title, text }) { return <div className="page-heading"><div><p className="eyebrow">PEDIDO FÁCIL</p><h1>{title}</h1><p className="muted">{text}</p></div></div>; }
function Empty({ text }) { return <div className="empty card"><span>✓</span><h2>Tudo em dia</h2><p>{text}</p></div>; }

function CloseoutCard({ closeout, supabase, action, busy }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    supabase.from("closeout_items").select("*, order_item:order_items(product:products(category))").eq("closeout_id", closeout.id).then(({ data }) => {
      setRows((data || []).filter(item => Number(item.return_base) > 0 || Number(item.damage_base) > 0));
      setLoaded(true);
    });
  }, [closeout.id, supabase]);
  const categories = groupItemsByCategory(rows);
  return <article className="card order-card closeout-card">
    <div className="order-head"><div><span className="eyebrow">{closeout.sector?.name} · {closeout.order?.order_code}</span><h3>Retorno de {closeout.order?.requester_name}</h3></div><span className="status status-return_submitted">Aguardando conferência</span></div>
    <p className="small muted">Enviado em {localTime(closeout.created_at)}</p>
    <div className="closeout-accordion-list">{categories.map(([category, categoryRows]) => <details className="category-accordion" key={category}><summary><span>{category}<small>{categoryRows.length} {categoryRows.length === 1 ? "item para conferir" : "itens para conferir"}</small></span><i aria-hidden="true">⌄</i></summary><div className="category-accordion-content">{categoryRows.map(item => <div className="closeout-review-row" key={item.id}><div className="closeout-review-name"><span>{item.emoji || "📦"}</span><b>{item.product_name}</b></div><div className="closeout-amounts">{Number(item.return_base) > 0 && <span className="closeout-amount returned">Voltou <b>{displayAmount(item.return_amount, item.return_unit)}</b></span>}{Number(item.damage_base) > 0 && <span className="closeout-amount damaged">Avaria <b>{displayAmount(item.damage_amount, item.damage_unit)}</b></span>}</div></div>)}</div></details>)}</div>
    {!loaded && <p className="muted">Carregando itens do retorno…</p>}
    {loaded && !rows.length && <p className="closeout-empty-note">Este fechamento não possui sobras ou avarias para conferir.</p>}
    <div className="order-foot"><span className="small muted">Confira os itens informados antes de registrar o fechamento.</span><button className="primary" disabled={busy || !loaded} onClick={() => action(closeout)}>Confirmar retorno e lançamento</button></div>
  </article>;
}
