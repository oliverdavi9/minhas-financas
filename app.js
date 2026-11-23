/* Minhas Finanças — telas e regras do app */
(function () {
  /* ---------- base ---------- */
  const CATS = {
    despesa: ["Moradia", "Alimentação", "Transporte", "Saúde", "Lazer", "Educação", "Assinaturas", "Outros"],
    receita: ["Salário", "Freelance", "Rendimentos", "Outras receitas"]
  };
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const brlC = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  const money = c => brl.format(c / 100);
  const money0 = c => brl0.format(c / 100);
  const moneyC = c => brlC.format(c / 100);
  const $ = id => document.getElementById(id);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad = n => String(n).padStart(2, "0");
  const today = new Date();
  const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const thisMonth = today.getFullYear() + "-" + pad(today.getMonth() + 1);

  const state = {
    tx: [], limites: {}, loaded: false, db: null, readOnly: false,
    view: null, real: [], plans: [], mine: [], recs: [], ter: false, openPeople: new Set(), rcView: "pessoas", rcPerson: "",
    f: { visao: { q: "", tipo: "" }, orcamento: { q: "", st: "" }, parcelas: { q: "", st: "", forma: "", cartao: "" }, cartoes: { q: "", de: "", cat: "" }, pessoas: { q: "", st: "" }, rclanc: { q: "", tipo: "" }, extrato: { cat: "", cartao: "", de: "" } }, cards: [], pagos: new Set(), pay: "", selCard: null, cardCor: "roxo", forma: "unica", base: "parcela", mes: thisMonth, range: 6, kind: "todos", q: "", editingCat: null,
    lastChartKey: "", cat: "Moradia"
  };

  const shiftMonth = (ym, d) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return x.getFullYear() + "-" + pad(x.getMonth() + 1); };
  const monthName = (ym, o) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", o || { month: "long", year: "numeric" }); };
  const shortMonth = ym => monthName(ym, { month: "short" }).replace(".", "");
  const inMonth = (t, ym) => t.data && t.data.slice(0, 7) === ym;
  function totals(ym) {
    let inc = 0, out = 0;
    for (const t of state.mine) if (inMonth(t, ym)) { if (t.tipo === "receita") inc += t.valorCentavos; else out += t.valorCentavos; }
    return { inc, out, bal: inc - out };
  }
  function parseMoney(str) {
    let s = String(str || "").replace(/[^\d,.-]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) : 0;
  }
  const initials = s => (s || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  /* ---------- efeitos ---------- */
  function countTo(el, cents, fmt) {
    const from = typeof el._v === "number" ? el._v : 0;
    el._v = cents;
    cancelAnimationFrame(el._raf);
    if (reduce || from === cents) { el.textContent = fmt(cents); return; }
    const t0 = performance.now(), dur = 900;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (cents - from) * e));
      if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  function setDelta(el, pct, invert, suffix) {
    el.className = "delta " + (pct === null ? "flat" : (pct > 0) !== !!invert ? "up" : pct === 0 ? "flat" : "down");
    el.textContent = pct === null ? "—" : (pct > 0 ? "▲ " : pct < 0 ? "▼ " : "") + Math.abs(pct) + "%" + (suffix || "");
  }
  // brilho que segue o cursor e paralaxe do fundo
  document.addEventListener("pointermove", e => {
    const card = e.target.closest && e.target.closest(".card");
    if (card) { const r = card.getBoundingClientRect(); card.style.setProperty("--mx", (e.clientX - r.left) + "px"); card.style.setProperty("--my", (e.clientY - r.top) + "px"); }
    if (!reduce) {
      const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      $("blob1").style.translate = (x * 40) + "px " + (y * 30) + "px";
      $("blob2").style.translate = (x * -30) + "px " + (y * -24) + "px";
    }
  }, { passive: true });
  // ondulação nos botões
  document.addEventListener("pointerdown", e => {
    const b = e.target.closest && e.target.closest("button");
    if (!b || reduce) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
    const sp = document.createElement("span"); sp.className = "ripple";
    sp.style.width = sp.style.height = s + "px";
    sp.style.left = (e.clientX - r.left - s / 2) + "px"; sp.style.top = (e.clientY - r.top - s / 2) + "px";
    b.append(sp); setTimeout(() => sp.remove(), 650);
  });
  function toast(text, bad) {
    const t = document.createElement("div"); t.className = "toast glass" + (bad ? " bad" : "");
    t.innerHTML = '<span class="icon-dot"><svg class="ico" viewBox="0 0 24 24" style="width:14px;height:14px">' + (bad ? '<path d="M18 6 6 18M6 6l12 12"/>' : '<path d="m5 12 5 5 9-10"/>') + "</svg></span>";
    t.append(document.createTextNode(text));
    $("toasts").append(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 2800);
  }
  function setStatus(text) { $("statusNotice").hidden = !text; $("statusText").textContent = text || ""; }

  /* ---------- tema ---------- */
  const SUN = '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg class="ico" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const isDark = () => { const a = document.documentElement.getAttribute("data-theme"); return a ? a === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  const paintThemeBtn = () => { $("themeBtn").innerHTML = isDark() ? SUN : MOON; };
  try { const saved = localStorage.getItem("mf-tema"); if (saved) document.documentElement.setAttribute("data-theme", saved); } catch (e) {}
  paintThemeBtn();
  $("themeBtn").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("mf-tema", next); } catch (e) {}
    paintThemeBtn();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeBtn);

  /* ---------- navegação entre telas ---------- */
  const VIEWS = ["visao", "orcamento", "parcelas", "cartoes", "receber", "extrato"];
  // pílula deslizante: um único efeito para menu, doca e filtros
  function syncSliders() {
    document.querySelectorAll("[data-slider]").forEach(g => {
      let s = g.querySelector(":scope > .slide");
      if (!s) { s = document.createElement("span"); s.className = "slide"; s.setAttribute("aria-hidden", "true"); g.prepend(s); }
      const cur = g.querySelector(g.dataset.slider);
      if (!cur || !cur.offsetWidth) { s.style.opacity = "0"; return; }
      const first = !s.dataset.placed;
      if (first) s.style.transition = "none";
      s.style.opacity = "1";
      s.style.width = cur.offsetWidth + "px";
      s.style.height = cur.offsetHeight + "px";
      s.style.transform = "translate(" + cur.offsetLeft + "px, " + cur.offsetTop + "px)";
      if (first) { void s.offsetWidth; s.style.transition = ""; s.dataset.placed = "1"; }
    });
  }
  let leaveT = null, enterT = null;
  function show(v, first) {
    if (v === state.view) return;
    const prev = state.view ? $("view-" + state.view) : null, next = $("view-" + v);
    state.view = v;
    document.querySelectorAll("[data-slider] [data-go]").forEach(b => b.setAttribute("aria-current", b.dataset.go === v ? "page" : "false"));
    syncSliders();
    clearTimeout(leaveT); clearTimeout(enterT);
    document.querySelectorAll(".view").forEach(x => { if (x !== prev && x !== next) { x.hidden = true; x.classList.remove("leave", "enter"); } });
    const enter = () => {
      if (prev) { prev.hidden = true; prev.classList.remove("leave", "enter"); }
      next.hidden = false;
      next.querySelectorAll(".stag").forEach((el, i) => el.style.setProperty("--i", i));
      next.classList.remove("enter"); void next.offsetWidth; next.classList.add("enter");
      window.scrollTo(0, 0);
      if (v === "visao") { state.lastChartKey = ""; renderChart(); }
      if (v === "orcamento") renderBudget();
      if (v === "parcelas") renderPlans();
      if (v === "cartoes") renderCards();
      if (v === "receber") renderReceber();
      syncSliders();
      enterT = setTimeout(() => next.classList.remove("enter"), 1300);
    };
    if (prev && !first && !reduce) { prev.classList.add("leave"); leaveT = setTimeout(enter, 200); } else enter();
  }
  function route() { const h = location.hash.slice(1); show(VIEWS.includes(h) ? h : "visao", !state.view); }
  window.addEventListener("hashchange", route);
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => {
    if (location.hash.slice(1) === b.dataset.go) show(b.dataset.go);
    else location.hash = b.dataset.go;
  }));

  /* ---------- render ---------- */
  function render() {
    syncFbars();
    state.tx = state.real.concat(state.plans.flatMap(p => planOccurrences(p, horizon())));
    // o que é de outra pessoa fica na fatura e no extrato, mas fora das suas receitas e despesas
    state.mine = state.tx.filter(t => !t.terceiro);
    document.body.classList.toggle("loading", !state.loaded);
    $("monthLabel").textContent = monthName(state.mes, { month: "short", year: "numeric" }).replace(".", "").replace(" de ", " ");
    $("exampleNotice").hidden = !(state.real.some(t => t.exemplo) || state.plans.some(p => p.exemplo) || state.cards.some(c => c.exemplo));
    renderHello(); renderBalance(); renderTiles(); renderChart(); renderGauge(); renderBudget(); renderActs(); renderRecent(); renderHeads(); renderPlans(); renderCards(); renderReceber();
  }

  function renderHello() {
    const h = new Date().getHours();
    $("greet").textContent = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    const rows = state.mine.filter(t => inMonth(t, state.mes));
    const out = rows.filter(t => t.tipo === "despesa");
    const [y, m] = state.mes.split("-").map(Number);
    const days = state.mes === thisMonth ? today.getDate() : new Date(y, m, 0).getDate();
    const spent = out.reduce((s, t) => s + t.valorCentavos, 0);
    $("cCount").textContent = state.loaded ? String(rows.length) : "—";
    countTo($("cDaily"), state.loaded ? Math.round(spent / Math.max(1, days)) : 0, money0);
    const top = out.slice().sort((a, b) => b.valorCentavos - a.valorCentavos)[0];
    $("cTop").textContent = top ? moneyC(top.valorCentavos) : state.loaded ? "R$ 0" : "—";
    $("cTopLabel").textContent = top ? "maior despesa · " + top.descricao : "maior despesa";
  }

  function renderBalance() {
    const end = state.mes;
    let acc = 0;
    for (const t of state.mine) if (t.data && t.data.slice(0, 7) <= end) acc += t.tipo === "receita" ? t.valorCentavos : -t.valorCentavos;
    const prevAcc = acc - totals(end).bal;
    countTo($("balTotal"), acc, money);
    const pct = prevAcc ? Math.round((acc - prevAcc) / Math.abs(prevAcc) * 100) : null;
    setDelta($("balDelta"), state.loaded ? pct : null, false, " no mês");
    const spent = {};
    let total = 0;
    for (const t of state.mine) if (t.tipo === "despesa" && inMonth(t, state.mes)) { spent[t.categoria] = (spent[t.categoria] || 0) + t.valorCentavos; total += t.valorCentavos; }
    const top = Object.entries(spent).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const box = $("wallets"); box.textContent = "";
    $("walletsTotal").textContent = total ? money0(total) + " no total" : "";
    if (!top.length) {
      const w = document.createElement("div"); w.className = "wallet"; w.style.gridColumn = "1 / -1";
      w.innerHTML = '<span class="label">Sem despesas neste mês ainda.</span>';
      box.append(w); return;
    }
    for (const [c, v] of top) {
      const w = document.createElement("div"); w.className = "wallet";
      const l = document.createElement("span"); l.className = "label"; l.textContent = c;
      const b = document.createElement("b"); b.className = "num"; b.textContent = moneyC(v);
      const s = document.createElement("span"); s.className = "label"; s.textContent = Math.round(v / total * 100) + "% das despesas";
      const m = document.createElement("div"); m.className = "meter"; const i = document.createElement("i"); i.style.width = (v / total * 100) + "%"; m.append(i);
      w.append(l, b, s, m); box.append(w);
    }
  }

  function renderTiles() {
    const cur = totals(state.mes), prev = totals(shiftMonth(state.mes, -1)), pm = shortMonth(shiftMonth(state.mes, -1));
    const ok = state.loaded;
    countTo($("tIn"), ok ? cur.inc : 0, money0);
    countTo($("tOut"), ok ? cur.out : 0, money0);
    countTo($("tBal"), ok ? cur.bal : 0, money0);
    const pctOf = (a, b) => b ? Math.round((a / b - 1) * 100) : null;
    const foot = (id, pct, invert) => {
      const f = $(id); f.textContent = "";
      if (!ok) { f.textContent = " "; return; }
      const d = document.createElement("span"); setDelta(d, pct, invert);
      f.append(d, pct === null ? "sem dados de " + pm : "vs " + pm);
    };
    foot("tInFoot", pctOf(cur.inc, prev.inc));
    foot("tOutFoot", pctOf(cur.out, prev.out), true);
    $("tBalFoot").textContent = ok ? (cur.bal >= 0 ? "sobrou no mês" : "gastou mais do que entrou") : " ";
    const rate = cur.inc ? Math.round(cur.bal / cur.inc * 100) : null;
    $("tRate").textContent = !ok ? "—" : rate === null ? "—" : rate + "%";
    $("tRateFoot").textContent = !ok ? " " : rate === null ? "sem receitas no mês" : rate >= 20 ? "meta de 20% atingida" : "meta sugerida: 20%";
  }

  function renderChart() {
    const box = $("chart"), tip = $("tip");
    box.querySelector("svg")?.remove();
    const months = []; for (let i = state.range - 1; i >= 0; i--) months.push(shiftMonth(state.mes, -i));
    const data = months.map(m => Object.assign({ m }, totals(m)));
    const W = Math.max(260, box.clientWidth || 520), H = 200, padL = 38, padB = 24, padT = 8;
    const max = Math.max(1, ...data.map(d => Math.max(d.inc, d.out)));
    const step = niceStep(max / 4), top = Math.ceil(max / step) * step;
    const y = v => padT + (H - padT - padB) * (1 - v / top);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Receitas e despesas por mês");
    const mk = (tag, a, parent, text) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); if (text != null) e.textContent = text; (parent || svg).appendChild(e); return e; };
    for (let v = 0; v <= top + 1; v += step) {
      mk("line", { x1: padL, x2: W, y1: y(v), y2: y(v), stroke: "var(--faint)", "stroke-width": 1, "stroke-dasharray": v ? "3 5" : "" });
      mk("text", { x: padL - 8, y: y(v) + 4, "text-anchor": "end" }, null, compact.format(v / 100));
    }
    const slot = (W - padL) / data.length, bw = Math.max(5, Math.min(18, slot * .26));
    const key = state.mes + "|" + state.range + "|" + state.loaded;
    box.classList.toggle("grow", key !== state.lastChartKey && state.loaded);
    state.lastChartKey = key;
    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2, cur = d.m === state.mes;
      const g = mk("g", { class: "col" });
      [[d.inc, "var(--accent)", -bw - 2], [d.out, "var(--ink)", 2]].forEach(([v, c, dx], j) => {
        const h = Math.max(v ? 3 : 0, y(0) - y(v));
        const r = mk("rect", { class: "bar", x: cx + dx, y: y(0) - h, width: bw, height: h, rx: Math.min(6, bw / 2), fill: c, opacity: cur ? 1 : .42 }, g);
        r.style.animationDelay = (i * 60 + j * 40) + "ms";
      });
      const t = mk("text", { x: cx, y: H - 6, "text-anchor": "middle" }, g, shortMonth(d.m));
      if (cur) t.setAttribute("style", "fill: var(--fg); font-weight: 700");
      const hit = mk("rect", { x: padL + slot * i, y: 0, width: slot, height: H, fill: "transparent", style: "cursor:pointer" }, g);
      const show = () => {
        tip.hidden = false; tip.textContent = "";
        const b = document.createElement("b"); b.textContent = monthName(d.m);
        const l1 = document.createElement("span"); l1.innerHTML = "<em style='font-style:normal;color:var(--accent)'>Receitas</em>"; l1.append(money(d.inc));
        const l2 = document.createElement("span"); l2.innerHTML = "<em style='font-style:normal'>Despesas</em>"; l2.append(money(d.out));
        const l3 = document.createElement("span"); l3.innerHTML = "<em style='font-style:normal;color:var(--muted)'>Saldo</em>"; l3.append(money(d.bal));
        tip.append(b, l1, l2, l3);
        const scale = box.clientWidth / W;
        tip.style.left = Math.min(Math.max(cx * scale, 90), box.clientWidth - 90) + "px";
        tip.style.top = y(Math.max(d.inc, d.out)) + "px";
      };
      hit.addEventListener("pointerenter", show);
      hit.addEventListener("pointerleave", () => { tip.hidden = true; });
      hit.addEventListener("click", () => { state.mes = d.m; render(); });
    });
    box.insertBefore(svg, tip);
    const withData = data.filter(d => d.inc || d.out);
    const n = Math.max(1, withData.length);
    $("avgIn").textContent = state.loaded ? money0(withData.reduce((s, d) => s + d.inc, 0) / n) : "—";
    $("avgOut").textContent = state.loaded ? money0(withData.reduce((s, d) => s + d.out, 0) / n) : "—";
    const best = withData.slice().sort((a, b) => b.bal - a.bal)[0];
    $("bestMonth").textContent = best ? shortMonth(best.m) + " · " + moneyC(best.bal) : state.loaded ? "—" : "—";
  }
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  // medidor segmentado
  const N = 34, segs = [];
  (function buildGauge() {
    const svg = $("gaugeSvg"), ns = "http://www.w3.org/2000/svg", cx = 120, cy = 124, r = 98;
    for (let i = 0; i < N; i++) {
      const a = Math.PI + (i + .5) / N * Math.PI;
      const x = cx + r * Math.cos(a), yy = cy + r * Math.sin(a), deg = a * 180 / Math.PI + 90;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", -3.6); rect.setAttribute("y", -13); rect.setAttribute("width", 7.2); rect.setAttribute("height", 26); rect.setAttribute("rx", 3.6);
      rect.setAttribute("transform", `translate(${x.toFixed(2)} ${yy.toFixed(2)}) rotate(${deg.toFixed(2)})`);
      rect.setAttribute("class", "seg-g");
      rect.style.transitionDelay = (i * 18) + "ms";
      svg.append(rect); segs.push(rect);
    }
  })();
  function spentByCat() {
    const s = {};
    for (const t of state.mine) if (t.tipo === "despesa" && inMonth(t, state.mes)) s[t.categoria] = (s[t.categoria] || 0) + t.valorCentavos;
    return s;
  }
  function renderGauge() {
    const s = spentByCat();
    const limTotal = Object.values(state.limites).reduce((a, b) => a + b, 0);
    const spent = Object.values(s).reduce((a, b) => a + b, 0);
    const pct = limTotal ? spent / limTotal : 0;
    const on = Math.round(Math.min(1, pct) * N);
    segs.forEach((r, i) => { r.classList.toggle("on", state.loaded && i < on && pct <= 1); r.classList.toggle("over", state.loaded && pct > 1); });
    countTo($("gaugeVal"), state.loaded ? spent : 0, money0);
    $("gaugeSub").textContent = limTotal ? "de " + money0(limTotal) + " planejados" : "defina limites nas categorias";
    const gp = $("gaugePct");
    gp.className = "delta " + (pct > 1 ? "down" : pct >= .8 ? "flat" : "up");
    gp.textContent = limTotal && state.loaded ? Math.round(pct * 100) + "% usado" : "—";
    let ok = 0, warn = 0, over = 0;
    for (const c in state.limites) { const p = (s[c] || 0) / state.limites[c]; if (p > 1) over++; else if (p >= .8) warn++; else ok++; }
    $("bOk").textContent = ok; $("bWarn").textContent = warn; $("bOver").textContent = over;
  }

  function renderBudget() {
    const box = $("budget"); box.textContent = "";
    const s = spentByCat();
    const fo = state.f.orcamento;
    const cats = CATS.despesa.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0)).filter(c => {
      const v = s[c] || 0, lim = state.limites[c] || 0, pct = lim ? v / lim : 0;
      if (!fhit(fo.q, c)) return false;
      return !fo.st || (fo.st === "gasto" ? v > 0 : fo.st === "lim" ? lim > 0 : fo.st === "sem" ? !lim : fo.st === "perto" ? lim && pct >= .8 && pct <= 1 : lim && pct > 1);
    });
    if (!cats.length) emptyState(box, "Nenhuma categoria com esse filtro.");
    cats.forEach((c, idx) => {
      const v = s[c] || 0, lim = state.limites[c] || 0, pct = lim ? v / lim : 0;
      const row = document.createElement("div"); row.className = "brow";
      const top = document.createElement("div"); top.className = "brow-top";
      const name = document.createElement("span"); name.textContent = c;
      const r = document.createElement("span"); r.className = "r num"; r.append(money0(v) + " /");
      if (state.editingCat === c) {
        const inp = document.createElement("input"); inp.className = "lim-input"; inp.id = "lim-" + idx; inp.inputMode = "decimal";
        inp.value = lim ? (lim / 100).toFixed(2).replace(".", ",") : ""; inp.placeholder = "0,00";
        inp.setAttribute("aria-label", "Limite mensal de " + c);
        let done = false;
        const commit = async save => {
          if (done) return; done = true; state.editingCat = null;
          if (!save) { render(); return; }
          const val = parseMoney(inp.value), next = Object.assign({}, state.limites);
          if (val > 0) next[c] = val; else delete next[c];
          state.limites = next; render();
          try { await state.db.doc("config/orcamento").set({ limites: next }); toast("Limite de " + c + " salvo"); }
          catch (e) { toast("O limite não foi salvo. Tente de novo.", true); }
        };
        inp.addEventListener("keydown", e => { if (e.key === "Enter") commit(true); if (e.key === "Escape") commit(false); });
        inp.addEventListener("blur", () => commit(true));
        r.append(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
      } else {
        const b = document.createElement("button"); b.type = "button"; b.className = "lim num";
        b.textContent = lim ? money0(lim) : "definir";
        b.disabled = state.readOnly || !state.db;
        b.setAttribute("aria-label", "Editar limite de " + c);
        b.addEventListener("click", () => { state.editingCat = c; render(); });
        r.append(b);
      }
      top.append(name, r);
      const tr = document.createElement("div"); tr.className = "track";
      const fill = document.createElement("i");
      if (!lim) fill.className = "none"; else if (pct > 1) fill.className = "over"; else if (pct >= .8) fill.className = "warn";
      tr.append(fill);
      requestAnimationFrame(() => { fill.style.width = (lim ? Math.min(100, pct * 100) : v ? 100 : 0) + "%"; });
      const note = document.createElement("div"); note.className = "bnote";
      if (lim) { if (pct > 1) { note.className += " over"; note.textContent = "Estourou em " + money(v - lim); } else note.textContent = "Restam " + money(lim - v) + " · " + Math.round(pct * 100) + "%"; }
      else note.textContent = v ? "Sem limite definido" : "Nada gasto";
      row.append(top, tr, note); box.append(row);
    });
  }

  function sortRecent(a, b) { return b.data.localeCompare(a.data) || (b.criadoEm || "").localeCompare(a.criadoEm || ""); }
  function skeletonRows(box, n) {
    for (let i = 0; i < n; i++) { const d = document.createElement("div"); d.className = "act"; d.innerHTML = '<span class="av skel"></span><span class="skel" style="height:16px"></span><span class="skel d" style="height:12px"></span><span></span><span class="skel" style="height:16px"></span><span></span>'; box.append(d); }
  }
  function emptyState(box, text) {
    const e = document.createElement("div"); e.className = "empty";
    e.innerHTML = '<span class="icon-dot"><svg class="ico" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></span>';
    const p = document.createElement("div"); p.textContent = text; e.append(p); box.append(e);
  }
  function buildRow(t, i, withDelete) {
    const inc = t.tipo === "receita";
    const r = document.createElement("div"); r.className = "act"; r.style.animationDelay = Math.min(i, 12) * 35 + "ms";
    const av = document.createElement("span"); av.className = "av " + (inc ? "in" : "out"); av.textContent = initials(t.descricao);
    const tt = document.createElement("div"); tt.className = "t";
    const d1 = document.createElement("div"); d1.textContent = t.descricao || "(sem descrição)";
    if (t.exemplo) { const x = document.createElement("span"); x.className = "ex"; x.textContent = "exemplo"; d1.append(x); }
    if (t.virtual) { const x = document.createElement("span"); x.className = "ex rec"; x.textContent = t.de ? t.parcela + "/" + t.de : "fixa"; d1.append(x); }
    const card = cardById(t.cartao);
    const ter = !!t.terceiro;
    if (ter) { r.classList.add("ter"); av.className = "av ter"; }
    const d2 = document.createElement("span"); d2.textContent = (ter ? "De " + t.terceiro : t.categoria) + " · " + t.data.slice(8, 10) + "/" + t.data.slice(5, 7) + (card ? " · " + card.nome : "");
    tt.append(d1, d2);
    const dt = document.createElement("span"); dt.className = "d num";
    dt.textContent = new Date(t.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
    const pill = document.createElement("span"); pill.className = "pill " + (ter ? "ter" : inc ? "in" : "out"); pill.textContent = ter ? "A receber" : inc ? "Receita" : "Despesa";
    const amt = document.createElement("span"); amt.className = "amt num rt" + (inc ? " in" : ""); amt.textContent = (inc ? "+ " : "− ") + money(t.valorCentavos);
    r.append(av, tt, dt, pill, amt);
    if (t.virtual && withDelete) {
      const g = document.createElement("button"); g.type = "button"; g.className = "del";
      g.setAttribute("aria-label", "Gerenciar " + (t.descricao || "parcelamento") + " na tela Parcelas");
      g.innerHTML = REPEAT;
      g.addEventListener("click", () => { location.hash = "parcelas"; });
      r.append(g); return r;
    }
    if (!withDelete || state.readOnly || !state.db) { r.append(document.createElement("span")); return r; }
    const del = document.createElement("button"); del.type = "button"; del.className = "del";
    del.setAttribute("aria-label", "Excluir " + (t.descricao || "lançamento"));
    del.innerHTML = '<svg class="ico" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
    del.addEventListener("click", async () => {
      if (!del.classList.contains("armed")) {
        del.classList.add("armed"); del.setAttribute("aria-label", "Confirmar exclusão");
        toast("Toque de novo para excluir");
        setTimeout(() => del.classList.remove("armed"), 3500);
        return;
      }
      del.disabled = true;
      try { await state.db.doc("lancamentos/" + t.id).delete(); toast("Lançamento excluído"); }
      catch (e) { del.disabled = false; toast("Não foi possível excluir agora.", true); }
    });
    r.append(del);
    return r;
  }
  function renderActs() {
    const box = $("acts"); box.textContent = "";
    if (!state.loaded) { skeletonRows(box, 5); $("actCount").textContent = ""; $("actSum").textContent = ""; return; }
    const q = state.q.trim().toLowerCase();
    const rows = state.tx.filter(t => inMonth(t, state.mes))
      .filter(t => state.kind === "todos" || t.tipo === state.kind)
      .filter(t => { const f = state.f.extrato; return (!f.cat || t.categoria === f.cat) && (!f.cartao || (f.cartao === "none" ? !cardById(t.cartao) : t.cartao === f.cartao)) && (!f.de || (f.de === "ter") === !!t.terceiro); })
      .filter(t => fhit(q, txText(t)))
      .sort(sortRecent);
    if (!rows.length) emptyState(box, q || state.kind !== "todos" || fbActive("extrato") ? "Nada encontrado com esse filtro." : "Nenhum lançamento em " + monthName(state.mes) + ". Toque em “Lançar” para registrar o primeiro.");
    rows.forEach((t, i) => box.append(buildRow(t, i, true)));
    const sum = rows.reduce((s, t) => s + (t.terceiro ? 0 : t.tipo === "receita" ? t.valorCentavos : -t.valorCentavos), 0);
    $("actCount").textContent = rows.length + (rows.length === 1 ? " lançamento" : " lançamentos");
    $("actSum").textContent = rows.length ? "Resultado: " + money(sum) : "";
  }
  function renderRecent() {
    const box = $("recent"); box.textContent = "";
    if (!state.loaded) { skeletonRows(box, 3); return; }
    const f = state.f.visao, active = !!(f.q || f.tipo);
    const rows = state.tx.filter(t => inMonth(t, state.mes))
      .filter(t => !f.tipo || (f.tipo === "ter" ? !!t.terceiro : t.tipo === f.tipo && !t.terceiro))
      .filter(t => fhit(f.q, txText(t)))
      .sort(sortRecent).slice(0, active ? 50 : 5);
    if (!rows.length) emptyState(box, active ? "Nada encontrado com esse filtro em " + monthName(state.mes) + "." : "Nenhum lançamento em " + monthName(state.mes) + " ainda.");
    rows.forEach((t, i) => box.append(buildRow(t, i, false)));
  }
  function renderHeads() {
    const ok = state.loaded, mn = monthName(state.mes);
    const spent = Object.values(spentByCat()).reduce((a, b) => a + b, 0);
    const plan = Object.values(state.limites).reduce((a, b) => a + b, 0);
    countTo($("oPlan"), ok ? plan : 0, money0);
    countTo($("oSpent"), ok ? spent : 0, money0);
    countTo($("oLeft"), ok ? plan - spent : 0, money0);
    $("orcSub").textContent = "Quanto ainda cabe em cada categoria em " + mn + ".";
    const t = totals(state.mes);
    countTo($("eIn"), ok ? t.inc : 0, money0);
    countTo($("eOut"), ok ? t.out : 0, money0);
    countTo($("eRes"), ok ? t.bal : 0, money0);
    $("extSub").textContent = "Todos os lançamentos de " + mn + ". Busque, filtre e exclua o que precisar.";
  }

  /* ---------- parcelamentos ---------- */
  const REPEAT = '<svg class="ico" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';
  const monthsBetween = (a, b) => { const [ya, ma] = a.split("-").map(Number), [yb, mb] = b.split("-").map(Number); return (yb - ya) * 12 + (mb - ma); };
  const fmMonth = ym => monthName(ym, { month: "short", year: "numeric" }).replace(".", "").replace(" de ", "/");
  const horizon = () => shiftMonth(state.mes > thisMonth ? state.mes : thisMonth, 12);
  // um plano vira um lançamento por mês, do mês de início até a última parcela (ou até ser encerrado)
  function planOccurrences(p, untilYm) {
    const out = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio || "")) return out;
    const S = p.inicio.slice(0, 7), day = Number(p.inicio.slice(8, 10));
    const N = p.parcelas || 0, first = p.primeira || 1;
    const count = N ? N - first + 1 : 600;
    for (let k = 0; k < count; k++) {
      const ym = shiftMonth(S, k);
      if (ym > untilYm || (p.encerradoEm && ym > p.encerradoEm)) break;
      const [y, m] = ym.split("-").map(Number);
      const n = first + k;
      let v = p.valorCentavos;
      if (N && p.totalCentavos && n === N) v = p.totalCentavos - p.valorCentavos * (N - 1);
      out.push({
        id: "p_" + p.id + "_" + n, virtual: true, plano: p.id, parcela: n, de: N,
        tipo: "despesa", descricao: p.descricao, categoria: p.categoria, valorCentavos: v,
        data: ym + "-" + pad(Math.min(day, new Date(y, m, 0).getDate())), exemplo: !!p.exemplo, criadoEm: p.criadoEm || "", cartao: p.cartao || null, terceiro: p.terceiro || null
      });
    }
    return out;
  }
  function planStatus(p, R) {
    const S = p.inicio.slice(0, 7), N = p.parcelas || 0, first = p.primeira || 1;
    const started = monthsBetween(S, R) >= 0;
    if (!N) {
      const ativo = !(p.encerradoEm && p.encerradoEm < R);
      return { fixa: true, started, ativo, label: ativo ? "Fixa mensal" : "Encerrada", lastYm: p.encerradoEm || null };
    }
    const naturalLast = shiftMonth(S, N - first);
    const lastYm = p.encerradoEm && p.encerradoEm < naturalLast ? p.encerradoEm : naturalLast;
    const planned = Math.max(0, monthsBetween(S, lastYm) + 1);
    const done = Math.max(0, Math.min(planned, monthsBetween(S, R) + 1));
    const atual = first - 1 + done, restantes = planned - done;
    const label = restantes === 0 ? (lastYm !== naturalLast ? "Encerrada" : "Quitada") : "Parcela " + Math.max(atual, first) + " de " + N;
    return { fixa: false, started, ativo: restantes > 0, label, lastYm, restantes, restValor: restantes * p.valorCentavos, pct: atual / N };
  }
  function twoStep(label, confirmLabel, action) {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-glass mini"; b.textContent = label;
    let t;
    b.addEventListener("click", async () => {
      if (!b.classList.contains("armed")) {
        b.classList.add("armed"); b.textContent = confirmLabel;
        t = setTimeout(() => { b.classList.remove("armed"); b.textContent = label; }, 4000);
        return;
      }
      clearTimeout(t); b.disabled = true;
      try { await action(); } catch (e) { b.disabled = false; toast("Não foi possível concluir agora.", true); }
    });
    return b;
  }
  function planCard(p, s, i) {
    const el = document.createElement("div"); el.className = "plan" + (s.ativo ? "" : " done"); el.style.animationDelay = Math.min(i, 10) * 50 + "ms";
    const av = document.createElement("span"); av.className = "av out"; av.textContent = initials(p.descricao);
    const mid = document.createElement("div"); mid.className = "mid";
    const name = document.createElement("div"); name.className = "name";
    const nm = document.createElement("span"); nm.textContent = p.descricao;
    const badge = document.createElement("span"); badge.className = "badge" + (s.ativo ? "" : " done");
    badge.textContent = !s.started && s.ativo ? "Começa em " + fmMonth(p.inicio.slice(0, 7)) : s.label;
    name.append(nm, badge);
    if (p.terceiro) { const x = document.createElement("span"); x.className = "badge ter"; x.textContent = "de " + p.terceiro; name.append(x); }
    if (p.exemplo) { const x = document.createElement("span"); x.className = "ex"; x.textContent = "exemplo"; name.append(x); }
    const dia = Number(p.inicio.slice(8, 10));
    const meta = document.createElement("span"); meta.className = "label";
    meta.textContent = p.categoria + " · todo dia " + dia + " · " + (s.fixa ? (s.lastYm ? "até " + fmMonth(s.lastYm) : "desde " + fmMonth(p.inicio.slice(0, 7))) : "termina em " + fmMonth(s.lastYm));
    mid.append(name, meta);
    if (!s.fixa) {
      const tr = document.createElement("div"); tr.className = "track"; const f = document.createElement("i"); tr.append(f);
      requestAnimationFrame(() => { f.style.width = Math.min(100, s.pct * 100) + "%"; });
      const note = document.createElement("span"); note.className = "bnote";
      note.textContent = s.restantes ? "Faltam " + s.restantes + (s.restantes === 1 ? " parcela" : " parcelas") + " depois de " + shortMonth(state.mes) + " · " + money(s.restValor) : "Todas as parcelas já foram lançadas";
      mid.append(tr, note);
    }
    const right = document.createElement("div"); right.className = "right";
    const val = document.createElement("b"); val.className = "num amt"; val.textContent = money(p.valorCentavos);
    const per = document.createElement("span"); per.className = "label"; per.textContent = "por mês";
    right.append(val, per);
    if (!state.readOnly && state.db) {
      const actions = document.createElement("div"); actions.className = "acts-row";
      if (s.ativo) actions.append(twoStep("Encerrar", "Parar após " + shortMonth(state.mes) + "?", async () => {
        await state.db.doc("planos/" + p.id).update({ encerradoEm: state.mes });
        toast(p.descricao + ": nada lançado depois de " + shortMonth(state.mes));
      }));
      actions.append(twoStep("Excluir", "Apagar todas as parcelas?", async () => {
        await state.db.doc("planos/" + p.id).delete();
        toast("Parcelamento excluído");
      }));
      right.append(actions);
    }
    el.append(av, mid, right);
    return el;
  }
  function renderPlans() {
    const box = $("plans"); box.textContent = "";
    const R = state.mes;
    const list = state.plans.map(p => ({ p, s: planStatus(p, R) }))
      .sort((a, b) => (b.s.ativo - a.s.ativo) || (b.p.valorCentavos - a.p.valorCentavos));
    const monthSum = state.mine.filter(t => t.virtual && inMonth(t, R)).reduce((a, t) => a + t.valorCentavos, 0);
    const left = list.reduce((a, x) => a + (x.s.fixa || x.p.terceiro ? 0 : x.s.restValor), 0);
    countTo($("pMonth"), state.loaded ? monthSum : 0, money0);
    countTo($("pLeft"), state.loaded ? left : 0, money0);
    $("pCount").textContent = state.loaded ? String(list.filter(x => x.s.ativo).length) : "—";
    $("pMonthLabel").textContent = "comprometido em " + shortMonth(R);
    if (!state.loaded) { skeletonRows(box, 3); renderProj(); return; }
    const fp = state.f.parcelas;
    const shown = list.filter(({ p, s }) => {
      const card = cardById(p.cartao);
      return fhit(fp.q, [p.descricao, p.categoria, card && card.nome, p.terceiro, money(p.valorCentavos)].join(" ")) &&
        (!fp.st || (fp.st === "ativo") === !!s.ativo) &&
        (!fp.forma || (fp.forma === "parcelada") === !!p.parcelas) &&
        (!fp.cartao || (fp.cartao === "none" ? !card : p.cartao === fp.cartao));
    });
    if (!list.length) emptyState(box, "Nenhum parcelamento ainda. Use “Nova parcelada” para lançar uma compra parcelada, um financiamento ou um consórcio.");
    else if (!shown.length) emptyState(box, "Nenhum parcelamento com esse filtro.");
    shown.forEach(({ p, s }, i) => box.append(planCard(p, s, i)));
    renderProj();
  }
  function renderProj() {
    const box = $("proj"); box.textContent = "";
    const months = []; for (let i = 0; i < 6; i++) months.push(shiftMonth(state.mes, i));
    const sums = months.map(m => state.mine.filter(t => t.virtual && inMonth(t, m)).reduce((a, t) => a + t.valorCentavos, 0));
    const max = Math.max(1, ...sums);
    months.forEach((m, i) => {
      const col = document.createElement("div"); col.className = "pcol" + (i === 0 ? " cur" : "");
      col.title = monthName(m) + ": " + money(sums[i]);
      const v = document.createElement("b"); v.className = "num"; v.textContent = sums[i] ? moneyC(sums[i]) : "—";
      const w = document.createElement("div"); w.className = "pwrap";
      const bar = document.createElement("i"); bar.className = "pbar"; bar.style.transitionDelay = i * 60 + "ms"; w.append(bar);
      requestAnimationFrame(() => { bar.style.height = (sums[i] / max * 100) + "%"; });
      const l = document.createElement("span"); l.textContent = shortMonth(m);
      col.append(v, w, l); box.append(col);
    });
  }

  /* forma de pagamento no formulário */
  function setForma(f) { state.forma = f; document.querySelectorAll("[data-forma]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.forma === f))); }
  function setBase(b) { state.base = b; document.querySelectorAll("[data-base]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.base === b))); }
  function intVal(id, min, max, dflt) { const n = parseInt($(id).value, 10); return isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; }
  function paintForma() {
    const despesa = $("tDespesa").checked;
    if (!despesa && state.forma !== "unica") setForma("unica");
    $("formaField").hidden = !despesa;
    $("payField").hidden = !despesa;
    $("parcBox").hidden = state.forma !== "parcelada";
    $("fixaBox").hidden = state.forma !== "fixa";
    $("fDataLabel").textContent = state.forma === "parcelada" ? "Data da primeira parcela a lançar" : state.forma === "fixa" ? "Data do primeiro mês" : "Data";
    $("addBtn").textContent = state.forma === "parcelada" ? "Lançar parcelamento" : state.forma === "fixa" ? "Lançar conta fixa" : "Adicionar lançamento";
    $("modalTitle").textContent = !despesa ? "Nova receita" : state.forma === "parcelada" ? "Despesa parcelada" : state.forma === "fixa" ? "Conta fixa" : "Nova despesa";
    paintTer();
    updatePreview();
    requestAnimationFrame(syncSliders);
  }
  function updatePreview() {
    const el = $("planPreview"), despesa = $("tDespesa").checked;
    const v = parseMoney($("fValor").value), d = $("fData").value, validD = /^\d{4}-\d{2}-\d{2}$/.test(d);
    const ym = validD ? d.slice(0, 7) : state.mes;
    let main = "";
    if (despesa && state.forma === "fixa") main = v ? money(v) + " todo mês a partir de " + fmMonth(ym) + ", até você encerrar" : "Digite o valor mensal";
    else if (despesa && state.forma === "parcelada") {
      const N = intVal("fParc", 2, 120, 10), P = intVal("fPrim", 1, N, 1);
      if (!v) main = state.base === "total" ? "Digite o valor total da compra" : "Digite o valor de cada parcela";
      else {
        const parcela = state.base === "total" ? Math.round(v / N) : v;
        main = (P > 1 ? "Parcelas " + P + " a " + N + " · " : "") + (N - P + 1) + "x de " + money(parcela) +
          " · total " + money(state.base === "total" ? v : parcela * N) + " · última em " + fmMonth(shiftMonth(ym, N - P));
      }
    }
    const card = despesa ? cardById(state.pay) : null;
    let cardTxt = "";
    if (card && validD) {
      const due = faturaDates(card, dueYm(card, d)).due;
      cardTxt = (state.forma === "unica" ? "Entra na fatura " : "1ª parcela na fatura ") + card.nome + " que vence em " + due.slice(8, 10) + "/" + due.slice(5, 7) + "/" + due.slice(0, 4);
    }
    const txt = [main, cardTxt].filter(Boolean).join(" · ");
    el.hidden = !txt; el.textContent = txt;
  }
  document.querySelectorAll("[data-forma]").forEach(b => b.addEventListener("click", () => { setForma(b.dataset.forma); paintForma(); }));
  document.querySelectorAll("[data-base]").forEach(b => b.addEventListener("click", () => { setBase(b.dataset.base); updatePreview(); syncSliders(); }));
  document.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => {
    $("fParc").value = Math.min(120, Math.max(2, intVal("fParc", 2, 120, 10) + Number(b.dataset.step)));
    updatePreview();
  }));
  ["fValor", "fParc", "fPrim", "fData"].forEach(id => $(id).addEventListener("input", updatePreview));

  /* ---------- cartões ---------- */
  const CARD_COLORS = { roxo: ["#8E6CF0", "#4B2FA8"], grafite: ["#3A3A41", "#111114"], verde: ["#46B89F", "#1E7563"], brasa: ["#FF7A59", "#B8312A"], azul: ["#4F8FE8", "#1D4C9F"], dourado: ["#D8B26A", "#8F6A2A"] };
  const cardStyle = (el, cor) => { const g = CARD_COLORS[cor] || CARD_COLORS.grafite; el.style.setProperty("--c1", g[0]); el.style.setProperty("--c2", g[1]); };
  const cardById = id => (id ? state.cards.find(c => c.id === id) : null) || null;
  const clampDay = (ym, day) => { const [y, m] = ym.split("-").map(Number); return ym + "-" + pad(Math.min(day, new Date(y, m, 0).getDate())); };
  const ddmm = d => d.slice(8, 10) + "/" + d.slice(5, 7);
  const sumV = a => a.reduce((s, t) => s + t.valorCentavos, 0);
  // em qual fatura (mês de vencimento) cai uma compra feita na data d
  function dueYm(c, d) {
    const ym = d.slice(0, 7), day = Number(d.slice(8, 10)), f = c.fechamento || 1, v = c.vencimento || 10;
    const closeYm = day >= f ? shiftMonth(ym, 1) : ym;
    return v > f ? closeYm : shiftMonth(closeYm, 1);
  }
  function faturaDates(c, Y) {
    const closeYm = (c.vencimento || 10) > (c.fechamento || 1) ? Y : shiftMonth(Y, -1);
    return { close: clampDay(closeYm, c.fechamento || 1), due: clampDay(Y, c.vencimento || 10) };
  }
  const payKey = (c, Y) => c.id + "_" + Y;
  function faturaStatus(c, Y) {
    if (state.pagos.has(payKey(c, Y))) return { k: "paga", t: "Paga" };
    const { close, due } = faturaDates(c, Y), td = ymd(today);
    if (td < close) return { k: "aberta", t: "Aberta" };
    if (td <= due) return { k: "fechada", t: "Fechada" };
    return { k: "vencida", t: "Vencida" };
  }
  const faturaItems = (c, Y) => state.tx.filter(t => t.tipo === "despesa" && t.cartao === c.id && t.data && dueYm(c, t.data) === Y);
  // limite ocupado: faturas ainda não pagas a partir deste mês, incluindo todas as parcelas futuras
  function limitUsed(c) {
    const far = shiftMonth(thisMonth, 130);
    const items = state.real.filter(t => t.tipo === "despesa" && t.cartao === c.id)
      .concat(state.plans.filter(p => p.cartao === c.id).flatMap(p => planOccurrences(p, far)));
    return items.reduce((s, t) => { const Y = dueYm(c, t.data); return Y >= thisMonth && !state.pagos.has(payKey(c, Y)) ? s + t.valorCentavos : s; }, 0);
  }
  async function togglePaid(c, Y) {
    const key = payKey(c, Y);
    try {
      if (state.pagos.has(key)) { await state.db.doc("pagamentos/" + key).delete(); toast("Fatura " + c.nome + " voltou para a pagar"); }
      else { await state.db.doc("pagamentos/" + key).set({ cartao: c.id, mes: Y, paga: true, em: new Date().toISOString() }); toast("Fatura " + c.nome + " marcada como paga"); }
    } catch (e) { toast("Não foi possível salvar agora.", true); }
  }
  function selectCard(id, scroll) {
    state.selCard = id;
    document.querySelectorAll("#ccards .cc").forEach(el => { const on = el.dataset.id === id; el.classList.toggle("sel", on); el.setAttribute("aria-pressed", String(on)); });
    renderFatura();
    if (scroll && innerWidth < 820) $("fatura").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  function cardVisual(c, total, st, i) {
    const Y = state.mes, el = document.createElement("div");
    el.className = "cc" + (c.id === state.selCard ? " sel" : ""); el.dataset.id = c.id; cardStyle(el, c.cor);
    el.style.animationDelay = i * 70 + "ms"; el.tabIndex = 0; el.setAttribute("role", "button");
    el.setAttribute("aria-pressed", String(c.id === state.selCard)); el.setAttribute("aria-label", "Ver compras da fatura " + c.nome);
    const top = document.createElement("div"); top.className = "cc-top";
    const nm = document.createElement("b"); nm.textContent = c.nome + (c.exemplo ? " · exemplo" : "");
    const s = document.createElement("span"); s.className = "cc-st " + st.k; s.textContent = st.t;
    top.append(nm, s);
    const chip = document.createElement("div"); chip.className = "cc-chip";
    const mid = document.createElement("div"); mid.className = "cc-mid";
    const ml = document.createElement("span"); ml.textContent = "Fatura de " + monthName(Y, { month: "long" });
    const mv = document.createElement("b"); mv.textContent = money(total);
    mid.append(ml, mv);
    const { close, due } = faturaDates(c, Y);
    const bot = document.createElement("div"); bot.className = "cc-bot";
    const o1 = document.createElement("span"); o1.className = "o"; o1.textContent = "Fecha " + ddmm(close) + " · vence " + ddmm(due);
    const o2 = document.createElement("span"); o2.className = "o"; o2.textContent = "Próxima: " + money0(sumV(faturaItems(c, shiftMonth(Y, 1))));
    bot.append(o1, o2);
    el.append(top, chip, mid, bot);
    if (c.limite) {
      const used = limitUsed(c), lim = document.createElement("div"); lim.className = "cc-lim";
      const lt = document.createElement("span"); lt.textContent = "Limite livre: " + money0(Math.max(0, c.limite - used)) + " de " + money0(c.limite);
      const bar = document.createElement("div"); bar.className = "bar"; const bi = document.createElement("i"); bar.append(bi);
      requestAnimationFrame(() => { bi.style.width = Math.min(100, used / c.limite * 100) + "%"; });
      lim.append(lt, bar); el.append(lim);
    } else el.append(document.createElement("span"));
    if (!state.readOnly && state.db) {
      const act = document.createElement("div"); act.className = "cc-actions";
      if (total > 0 || st.k === "paga") {
        const pb = document.createElement("button"); pb.type = "button"; pb.className = "btn mini";
        pb.textContent = st.k === "paga" ? "Desmarcar pagamento" : "Marcar como paga";
        pb.addEventListener("click", () => { pb.disabled = true; togglePaid(c, Y); });
        act.append(pb);
      }
      const eb = document.createElement("button"); eb.type = "button"; eb.className = "btn mini"; eb.textContent = "Editar";
      eb.addEventListener("click", () => openCard(c, false));
      act.append(eb); el.append(act);
    }
    el.addEventListener("click", e => { if (!e.target.closest("button")) selectCard(c.id, true); });
    el.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); selectCard(c.id, true); } });
    return el;
  }
  function renderCards() {
    const Y = state.mes, mn = shortMonth(Y), ok = state.loaded;
    const cards = state.cards.slice().sort((a, b) => (a.vencimento || 0) - (b.vencimento || 0) || a.nome.localeCompare(b.nome));
    if (!cardById(state.selCard)) state.selCard = cards[0] ? cards[0].id : null;
    const fats = cards.map(c => { const items = faturaItems(c, Y); return { c, items, total: sumV(items), st: faturaStatus(c, Y) }; });
    const fatSum = fats.reduce((s, x) => s + x.total, 0);
    const others = state.tx.filter(t => t.tipo === "despesa" && inMonth(t, Y) && !cardById(t.cartao));
    const otherSum = sumV(others);
    const paid = fats.filter(x => x.st.k === "paga").reduce((s, x) => s + x.total, 0);
    countTo($("kFat"), ok ? fatSum : 0, money0);
    countTo($("kOther"), ok ? otherSum : 0, money0);
    countTo($("kTotal"), ok ? fatSum + otherSum : 0, money0);
    $("kFatLabel").textContent = "faturas que vencem em " + mn;
    $("kOtherLabel").textContent = "outras contas de " + mn;
    $("kTotalLabel").textContent = paid ? "total do mês · falta " + money0(fatSum + otherSum - paid) : "total a pagar em " + mn;
    $("cardSub").textContent = "Quanto vai cair em cada cartão em " + monthName(Y) + " e quanto dá tudo somado.";
    const box = $("ccards"); box.textContent = "";
    if (!ok) { skeletonRows(box, 2); }
    else if (!cards.length) {
      const w = document.createElement("div"); w.className = "ccard-empty";
      emptyState(w, "Nenhum cartão cadastrado. Cadastre seus cartões com o dia de fechamento e de vencimento para ver o valor de cada fatura.");
      if (!state.readOnly && state.db) { const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-accent"; b.textContent = "Cadastrar primeiro cartão"; b.addEventListener("click", () => openCard(null, false)); w.append(b); }
      box.append(w);
    }
    fats.forEach((x, i) => box.append(cardVisual(x.c, x.total, x.st, i)));
    renderPaylist(fats, others, otherSum, paid);
    renderFatura();
  }
  function renderPaylist(fats, others, otherSum, paid) {
    const box = $("paylist"); box.textContent = "";
    $("payMonth").textContent = monthName(state.mes);
    const row = (tag, cls) => { const r = document.createElement(tag); r.className = "prow" + (cls ? " " + cls : ""); if (tag === "button") r.type = "button"; return r; };
    fats.forEach(({ c, total, st }) => {
      const r = row("button", st.k === "paga" ? "paid" : "");
      r.setAttribute("aria-label", "Ver fatura " + c.nome);
      const d = document.createElement("span"); d.className = "dotc"; cardStyle(d, c.cor);
      const t = document.createElement("div"); t.className = "t";
      const t1 = document.createElement("div"); t1.textContent = c.nome;
      const t2 = document.createElement("span"); t2.textContent = "vence " + ddmm(faturaDates(c, state.mes).due);
      t.append(t1, t2);
      const b = document.createElement("span"); b.className = "badge " + st.k; b.textContent = st.t;
      const v = document.createElement("span"); v.className = "v num"; v.textContent = money(total);
      r.append(d, t, b, v);
      r.addEventListener("click", () => selectCard(c.id, true));
      box.append(r);
    });
    const r = row("div");
    const d = document.createElement("span"); d.className = "dotc"; d.style.setProperty("--c1", "var(--muted)"); d.style.setProperty("--c2", "var(--muted)");
    const t = document.createElement("div"); t.className = "t";
    const t1 = document.createElement("div"); t1.textContent = "Pix, dinheiro e débito";
    const t2 = document.createElement("span"); t2.textContent = others.length + (others.length === 1 ? " conta no mês" : " contas no mês");
    t.append(t1, t2);
    const v = document.createElement("span"); v.className = "v num"; v.textContent = money(otherSum);
    r.append(d, t, document.createElement("span"), v); box.append(r);
    const sep = document.createElement("div"); sep.className = "psep"; box.append(sep);
    const tot = (label, val, sub) => { const x = document.createElement("div"); x.className = "ptotal" + (sub ? " sub" : ""); const l = document.createElement("span"); l.textContent = label; const b = document.createElement("b"); b.className = "num"; b.textContent = money(val); x.append(l, b); box.append(x); };
    const fatSum = fats.reduce((s, x) => s + x.total, 0);
    tot("Total do mês", fatSum + otherSum);
    tot("Só cartões", fatSum, true);
    if (paid) { tot("Já pago", paid, true); tot("Falta pagar", fatSum + otherSum - paid, true); }
  }
  function renderFatura() {
    const box = $("fatItems"); box.textContent = "";
    const c = cardById(state.selCard);
    if (!state.loaded) { skeletonRows(box, 3); return; }
    if (!c) { $("fatTitle").textContent = "Compras da fatura"; $("fatMeta").textContent = ""; emptyState(box, "Cadastre um cartão para ver as compras de cada fatura."); return; }
    const Y = state.mes, items = faturaItems(c, Y).sort(sortRecent), { close, due } = faturaDates(c, Y);
    $("fatTitle").textContent = "Fatura " + c.nome;
    $("fatMeta").textContent = "fecha " + ddmm(close) + " · vence " + ddmm(due) + " · " + items.length + (items.length === 1 ? " compra" : " compras");
    const fc = state.f.cartoes;
    const shown = items.filter(t => fhit(fc.q, txText(t)) && (!fc.de || (fc.de === "ter") === !!t.terceiro) && (!fc.cat || t.categoria === fc.cat));
    if (shown.length !== items.length) $("fatMeta").textContent += " · mostrando " + shown.length + " · " + money(sumV(shown));
    if (!items.length) emptyState(box, "Nenhuma compra na fatura que vence em " + ddmm(due) + ".");
    else if (!shown.length) emptyState(box, "Nenhuma compra com esse filtro nesta fatura.");
    shown.forEach((t, i) => box.append(buildRow(t, i, true)));
  }

  /* forma de pagamento (cartão) no lançamento */
  function paintPay() {
    const box = $("payOpts"); box.textContent = "";
    if (state.pay && !cardById(state.pay)) state.pay = "";
    [{ id: "", nome: "Pix, dinheiro ou débito" }].concat(state.cards).forEach(o => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = o.nome;
      if (o.id) { const d = document.createElement("span"); d.className = "dotc"; cardStyle(d, o.cor); b.prepend(d); }
      b.setAttribute("aria-pressed", String(o.id === state.pay));
      b.addEventListener("click", () => { state.pay = o.id; paintPay(); updatePreview(); });
      box.append(b);
    });
    if (!state.readOnly && state.db) {
      const add = document.createElement("button"); add.type = "button"; add.className = "add"; add.textContent = "+ Novo cartão";
      add.addEventListener("click", () => openCard(null, true));
      box.append(add);
    }
  }

  /* cadastro de cartão */
  let editingCard = null, cardFromTx = false, cardLastFocus = null;
  function paintSwatches() {
    const box = $("swatches"); box.textContent = "";
    Object.keys(CARD_COLORS).forEach(k => {
      const b = document.createElement("button"); b.type = "button"; cardStyle(b, k);
      b.setAttribute("aria-label", "Cor " + k); b.setAttribute("aria-pressed", String(k === state.cardCor));
      b.addEventListener("click", () => { state.cardCor = k; paintSwatches(); paintCardPreview(); });
      box.append(b);
    });
  }
  function paintCardPreview() {
    cardStyle($("ccPreview"), state.cardCor);
    $("ccpName").textContent = $("cNome").value.trim() || "Nome do cartão";
    const f = parseInt($("cFech").value, 10), v = parseInt($("cVenc").value, 10);
    $("ccpMeta").textContent = "Fecha dia " + (f >= 1 && f <= 31 ? f : "—") + " · vence dia " + (v >= 1 && v <= 31 ? v : "—");
  }
  function openCard(c, fromTx) {
    cardLastFocus = document.activeElement; editingCard = c; cardFromTx = fromTx;
    $("cardTitle").textContent = c ? "Editar cartão" : "Novo cartão";
    $("cNome").value = c ? c.nome : ""; $("cFech").value = c ? c.fechamento : ""; $("cVenc").value = c ? c.vencimento : "";
    $("cLim").value = c && c.limite ? (c.limite / 100).toFixed(2).replace(".", ",") : "";
    state.cardCor = c && CARD_COLORS[c.cor] ? c.cor : "roxo";
    $("cardMsg").textContent = ""; $("cardMsg").className = "msg";
    const wrap = $("cardDelWrap"); wrap.textContent = "";
    if (c) wrap.append(twoStep("Excluir cartão", "Confirmar exclusão", async () => {
      await state.db.doc("cartoes/" + c.id).delete();
      closeCard(); toast("Cartão excluído. As compras dele passam a contar como sem cartão.");
    }));
    paintSwatches(); paintCardPreview();
    $("cardOverlay").classList.add("open"); $("cardOverlay").setAttribute("aria-hidden", "false");
    setTimeout(() => $("cNome").focus(), 80);
  }
  function closeCard() {
    $("cardOverlay").classList.remove("open"); $("cardOverlay").setAttribute("aria-hidden", "true");
    if (cardLastFocus && cardLastFocus.focus) cardLastFocus.focus();
  }
  function cardFail(text, el) {
    const m = $("cardMsg"); m.className = "msg err"; m.textContent = text;
    const md = $("cardModal"); md.classList.remove("shake"); void md.offsetWidth; md.classList.add("shake");
    if (el) el.focus();
  }
  ["cNome", "cFech", "cVenc"].forEach(id => $(id).addEventListener("input", paintCardPreview));
  $("closeCard").addEventListener("click", closeCard);
  $("cardOverlay").addEventListener("click", e => { if (e.target === $("cardOverlay")) closeCard(); });
  document.querySelectorAll("[data-card-new]").forEach(b => b.addEventListener("click", () => openCard(null, false)));
  $("cardForm").addEventListener("submit", async e => {
    e.preventDefault();
    const nome = $("cNome").value.trim(), f = parseInt($("cFech").value, 10), v = parseInt($("cVenc").value, 10), lim = parseMoney($("cLim").value);
    if (!nome) return cardFail("Dê um nome ao cartão, como “Cartão principal”.", $("cNome"));
    if (!(f >= 1 && f <= 31)) return cardFail("Informe o dia do fechamento, de 1 a 31.", $("cFech"));
    if (!(v >= 1 && v <= 31)) return cardFail("Informe o dia do vencimento, de 1 a 31.", $("cVenc"));
    if (!state.db) return cardFail("Entre na sua conta para salvar cartões.");
    const data = { nome, cor: state.cardCor, fechamento: f, vencimento: v, limite: lim > 0 ? lim : null };
    $("cardSave").disabled = true;
    try {
      if (editingCard) { await state.db.doc("cartoes/" + editingCard.id).update(data); toast("Cartão " + nome + " atualizado"); }
      else {
        const ref = await state.db.collection("cartoes").add(Object.assign({ criadoEm: new Date().toISOString() }, data));
        toast("Cartão " + nome + " cadastrado");
        if (cardFromTx) { state.pay = ref.id; }
        state.selCard = ref.id;
      }
      closeCard();
    } catch (err) {
      cardFail(err && err.code === "invalid_argument" ? "Não deu para salvar. Confira os dados e tente de novo." : (navigator.onLine ? "Não deu para salvar agora. Tente de novo em instantes." : "Sem internet. Conecte-se para salvar."));
    } finally { $("cardSave").disabled = false; }
  });

  /* ---------- filtros e controles ---------- */
  document.querySelectorAll("[data-range]").forEach(b => b.addEventListener("click", () => {
    state.range = Number(b.dataset.range);
    document.querySelectorAll("[data-range]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    syncSliders(); state.lastChartKey = ""; renderChart();
  }));
  document.querySelectorAll("[data-kind]").forEach(b => b.addEventListener("click", () => {
    state.kind = b.dataset.kind;
    document.querySelectorAll("[data-kind]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    syncSliders(); renderActs();
  }));
  let qT; $("q").addEventListener("input", e => { clearTimeout(qT); qT = setTimeout(() => { state.q = e.target.value; renderActs(); }, 120); });
  $("prev").addEventListener("click", () => { state.mes = shiftMonth(state.mes, -1); render(); });
  $("next").addEventListener("click", () => { state.mes = shiftMonth(state.mes, 1); render(); });

  /* ---------- modal ---------- */
  let lastFocus = null;
  function paintCats() {
    const tipo = document.querySelector('input[name="tipo"]:checked').value, box = $("cats");
    if (!CATS[tipo].includes(state.cat)) state.cat = CATS[tipo][0];
    box.textContent = "";
    for (const c of CATS[tipo]) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = c;
      b.setAttribute("aria-pressed", String(c === state.cat));
      b.addEventListener("click", () => { state.cat = c; paintCats(); });
      box.append(b);
    }
  }
  function openModal(kind) {
    lastFocus = document.activeElement;
    const tipo = kind === "receita" ? "receita" : "despesa";
    (tipo === "receita" ? $("tReceita") : $("tDespesa")).checked = true;
    state.cat = kind === "fixa" ? "Moradia" : CATS[tipo][0]; paintCats();
    setForma(kind === "parcelada" || kind === "fixa" ? kind : "unica");
    setBase("parcela");
    state.pay = ""; paintPay();
    state.ter = kind === "terceiro"; $("fTer").value = "";
    $("fParc").value = "10"; $("fPrim").value = "1";
    $("fData").value = ymd(state.mes === thisMonth ? today : new Date(state.mes + "-01T12:00:00"));
    $("formMsg").textContent = ""; $("formMsg").className = "msg";
    $("overlay").classList.add("open"); $("overlay").setAttribute("aria-hidden", "false");
    paintForma();
    setTimeout(() => { syncSliders(); $("fValor").focus(); }, 80);
  }
  function closeModal() {
    $("overlay").classList.remove("open"); $("overlay").setAttribute("aria-hidden", "true");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openModal(b.dataset.open)));
  $("closeModal").addEventListener("click", closeModal);
  $("overlay").addEventListener("click", e => { if (e.target === $("overlay")) closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("rcOverlay").classList.contains("open")) closeRc();
    else if ($("cardOverlay").classList.contains("open")) closeCard();
    else if ($("overlay").classList.contains("open")) closeModal();
  });
  document.querySelectorAll('input[name="tipo"]').forEach(r => r.addEventListener("change", () => {
    paintCats(); paintForma();
  }));
  function fail(text, el) {
    const m = $("formMsg"); m.className = "msg err"; m.textContent = text;
    const modal = document.querySelector(".modal"); modal.classList.remove("shake"); void modal.offsetWidth; modal.classList.add("shake");
    if (el) el.focus();
  }
  $("txForm").addEventListener("submit", async e => {
    e.preventDefault();
    const descricao = $("fDesc").value.trim(), valorCentavos = parseMoney($("fValor").value), data = $("fData").value;
    const tipo = document.querySelector('input[name="tipo"]:checked').value;
    const ter = state.ter ? canonName($("fTer").value) : "";
    if (valorCentavos <= 0) return fail("Informe um valor maior que zero, como 45,90.", $("fValor"));
    if (state.ter && !ter) return fail("Escreva o nome da pessoa.", $("fTer"));
    if (!descricao && !(ter && tipo === "receita")) return fail("Escreva uma descrição para o lançamento.", $("fDesc"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return fail("Escolha a data do lançamento.", $("fData"));
    if (!state.db) return fail("Entre na sua conta para salvar lançamentos.");
    const forma = tipo === "despesa" ? state.forma : "unica";
    const categoria = ter ? "Outros" : state.cat;
    $("addBtn").disabled = true;
    try {
      if (ter && tipo === "receita") {
        await state.db.collection("recebimentos").add({ pessoa: ter, valorCentavos, data, obs: "", criadoEm: new Date().toISOString() });
        toast(ter + " te pagou " + money(valorCentavos) + ". Não entra como receita.");
      } else if (forma === "unica") {
        await state.db.collection("lancamentos").add({ tipo, descricao, valorCentavos, data, categoria, cartao: tipo === "despesa" ? (state.pay || null) : null, terceiro: ter || null, criadoEm: new Date().toISOString() });
        toast(ter ? "Lançado para " + ter + ": " + money(valorCentavos) + ". Não conta como sua despesa." : (tipo === "receita" ? "Receita" : "Despesa") + " de " + money(valorCentavos) + " adicionada");
      } else {
        const N = forma === "parcelada" ? intVal("fParc", 2, 120, 10) : 0;
        const primeira = forma === "parcelada" ? intVal("fPrim", 1, N, 1) : 1;
        const total = forma === "parcelada" && state.base === "total" ? valorCentavos : null;
        const parcela = total ? Math.round(total / N) : valorCentavos;
        await state.db.collection("planos").add({ forma, descricao, categoria, valorCentavos: parcela, totalCentavos: total, parcelas: N, primeira, inicio: data, cartao: state.pay || null, terceiro: ter || null, criadoEm: new Date().toISOString() });
        toast((forma === "parcelada" ? "Parcelado em " + (N - primeira + 1) + "x de " + money(parcela) : "Conta fixa de " + money(parcela) + " por mês criada") + (ter ? " para " + ter : ""));
      }
      $("fDesc").value = ""; $("fValor").value = "";
      closeModal();
      if (data.slice(0, 7) !== state.mes) { state.mes = data.slice(0, 7); render(); }
    } catch (err) {
      fail(err && err.code === "invalid_argument" ? "Não deu para salvar. Confira os dados e tente de novo." : (navigator.onLine ? "Não deu para salvar agora. Tente de novo em instantes." : "Sem internet. Conecte-se para salvar."));
    } finally { $("addBtn").disabled = false; }
  });

  /* ---------- a receber: o que outras pessoas te devem ---------- */
  const pkey = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  // usa a grafia já cadastrada quando o nome é o mesmo ("joão" vira "João")
  function canonName(n) {
    const clean = String(n || "").trim().replace(/\s+/g, " ").slice(0, 40), k = pkey(clean);
    if (!k) return "";
    const hit = knownPeople().find(x => pkey(x) === k);
    return hit || clean;
  }
  function knownPeople() {
    // por pessoa, a grafia mais usada (no empate, a que começa com maiúscula)
    const seen = new Map();
    const add = n => { const k = pkey(n); if (!k) return; const e = seen.get(k) || { n: 0, sp: new Map() }; e.n++; const t = n.trim().replace(/\s+/g, " "); e.sp.set(t, (e.sp.get(t) || 0) + 1); seen.set(k, e); };
    state.real.forEach(t => t.terceiro && add(t.terceiro));
    state.plans.forEach(p => p.terceiro && add(p.terceiro));
    state.recs.forEach(r => r.pessoa && add(r.pessoa));
    const best = e => [...e.sp.entries()].sort((a, b) => b[1] - a[1] || (/^[A-ZÀ-Ý]/.test(b[0]) - /^[A-ZÀ-Ý]/.test(a[0])))[0][0];
    return [...seen.values()].sort((a, b) => b.n - a.n).map(best);
  }
  // cada dívida vence no mês da fatura (se foi no cartão) ou no mês do lançamento;
  // os pagamentos abatem as dívidas mais antigas primeiro
  function peopleData(R) {
    const far = shiftMonth(thisMonth, 130), fixUntil = R > thisMonth ? R : thisMonth;
    const map = new Map();
    const get = name => { const k = pkey(name); if (!map.has(k)) map.set(k, { k, nome: canonName(name), debts: [], pays: [] }); return map.get(k); };
    state.real.forEach(t => { if (t.terceiro) get(t.terceiro).debts.push(Object.assign({}, t)); });
    state.plans.forEach(p => { if (p.terceiro) planOccurrences(p, p.parcelas ? far : fixUntil).forEach(t => get(p.terceiro).debts.push(t)); });
    state.recs.forEach(r => { if (r.pessoa) get(r.pessoa).pays.push(r); });
    const out = [];
    map.forEach(pp => {
      pp.debts.forEach(t => { const c = cardById(t.cartao); t.due = c ? dueYm(c, t.data) : t.data.slice(0, 7); });
      pp.debts.sort((a, b) => a.due.localeCompare(b.due) || a.data.localeCompare(b.data));
      pp.pays.sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || "").localeCompare(a.criadoEm || ""));
      pp.paid = pp.pays.filter(r => r.data.slice(0, 7) <= R).reduce((a, r) => a + r.valorCentavos, 0);
      let left = pp.paid;
      pp.pend = 0; pp.fut = 0; pp.dueSum = 0; pp.nPend = 0;
      pp.debts.forEach(t => {
        t.cover = Math.min(left, t.valorCentavos); left -= t.cover;
        if (t.due <= R) { pp.dueSum += t.valorCentavos; pp.pend += t.valorCentavos - t.cover; if (t.cover < t.valorCentavos) pp.nPend++; }
        else pp.fut += t.valorCentavos - t.cover;
      });
      pp.credit = left;
      pp.gotMonth = pp.pays.filter(r => r.data.slice(0, 7) === R).reduce((a, r) => a + r.valorCentavos, 0);
      out.push(pp);
    });
    return out.sort((a, b) => b.pend - a.pend || b.fut - a.fut || a.nome.localeCompare(b.nome));
  }
  function renderReceber() {
    const R = state.mes, ok = state.loaded, list = peopleData(R);
    const pend = list.reduce((a, p) => a + p.pend, 0), fut = list.reduce((a, p) => a + p.fut, 0), got = list.reduce((a, p) => a + p.gotMonth, 0);
    countTo($("rcPend"), ok ? pend : 0, money0);
    countTo($("rcFut"), ok ? fut : 0, money0);
    countTo($("rcGot"), ok ? got : 0, money0);
    $("rcPendLabel").textContent = "pendente até " + shortMonth(R);
    $("rcGotLabel").textContent = "recebido em " + shortMonth(R);
    // atalho na visão geral
    const owing = list.filter(p => p.pend > 0);
    $("cRecChip").hidden = !ok || !(pend > 0);
    $("cRec").textContent = money0(pend);
    $("cRecLabel").textContent = owing.length === 1 ? "a receber de " + owing[0].nome : "a receber de " + owing.length + " pessoas";
    renderRcLanc();
    const box = $("people"); box.textContent = "";
    if (!ok) { skeletonRows(box, 2); return; }
    if (!list.length) { emptyState(box, "Ninguém te deve nada por enquanto. Ao lançar uma despesa, toque em “É de outra pessoa” e acompanhe aqui o que cada um tem que te pagar."); return; }
    const fpp = state.f.pessoas;
    const shown = list.filter(pp => fhit(fpp.q, pp.nome) && (!fpp.st || (fpp.st === "pend" ? pp.pend > 0 : fpp.st === "fut" ? pp.fut > 0 : !pp.pend)));
    if (!shown.length) emptyState(box, "Ninguém encontrado com esse filtro.");
    shown.forEach((pp, i) => box.append(personCard(pp, i, R)));
  }
  // aba "Lançamentos": só o que é de outras pessoas, e os pagamentos delas, no mês exibido
  function renderRcLanc() {
    const R = state.mes, box = $("rcActs"); box.textContent = "";
    const lanc = state.rcView === "lanc";
    $("people").hidden = lanc; $("rcLanc").hidden = !lanc;
    document.querySelector('[data-fbar="pessoas"]').hidden = lanc;
    if (!lanc) return;
    const fb = $("rcFilter"); fb.textContent = "";
    const people = knownPeople();
    if (state.rcPerson && !people.some(n => pkey(n) === state.rcPerson)) state.rcPerson = "";
    if (people.length > 1) [""].concat(people).forEach(n => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = n || "Todas";
      b.setAttribute("aria-pressed", String(pkey(n) === state.rcPerson));
      b.addEventListener("click", () => { state.rcPerson = pkey(n); renderRcLanc(); });
      fb.append(b);
    });
    if (!state.loaded) { skeletonRows(box, 3); $("rcCount").textContent = ""; $("rcSum").textContent = ""; return; }
    const who = x => !state.rcPerson || pkey(x) === state.rcPerson;
    const debts = state.tx.filter(t => t.terceiro && inMonth(t, R) && who(t.terceiro));
    const pays = state.recs.filter(r => r.data && r.data.slice(0, 7) === R && who(r.pessoa)).map(r => Object.assign({ pay: true }, r));
    const fr = state.f.rclanc;
    const rows = (fr.tipo === "p" ? [] : debts).concat(fr.tipo === "d" ? [] : pays)
      .filter(x => fhit(fr.q, x.pay ? ["pagamento", x.pessoa, x.obs, money(x.valorCentavos), ddmm(x.data)].join(" ") : txText(x))).sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || "").localeCompare(a.criadoEm || ""));
    if (!rows.length) emptyState(box, fbActive("rclanc") ? "Nada encontrado com esse filtro." : "Nada de outras pessoas em " + monthName(R) + ". Use “Lançar para alguém” ou “Registrar pagamento”.");
    rows.forEach((t, i) => box.append(t.pay ? payRow(t, i) : buildRow(t, i, true)));
    const out = debts.reduce((a, t) => a + t.valorCentavos, 0), got = pays.reduce((a, r) => a + r.valorCentavos, 0);
    $("rcCount").textContent = debts.length + (debts.length === 1 ? " compra" : " compras") + " · " + pays.length + (pays.length === 1 ? " pagamento" : " pagamentos");
    $("rcSum").textContent = rows.length ? "Lançado " + money(out) + " · recebido " + money(got) : "";
  }
  function payRow(r, i) {
    const el = document.createElement("div"); el.className = "act"; el.style.animationDelay = Math.min(i, 12) * 35 + "ms";
    const av = document.createElement("span"); av.className = "av in"; av.textContent = initials(r.pessoa);
    const tt = document.createElement("div"); tt.className = "t";
    const d1 = document.createElement("div"); d1.textContent = "Pagamento de " + canonName(r.pessoa);
    const d2 = document.createElement("span"); d2.textContent = (r.obs ? r.obs + " · " : "") + r.data.slice(8, 10) + "/" + r.data.slice(5, 7);
    tt.append(d1, d2);
    const dt = document.createElement("span"); dt.className = "d num";
    dt.textContent = new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
    const pill = document.createElement("span"); pill.className = "pill in"; pill.textContent = "Recebido";
    const amt = document.createElement("span"); amt.className = "amt num rt in"; amt.textContent = "+ " + money(r.valorCentavos);
    el.append(av, tt, dt, pill, amt);
    if (state.readOnly || !state.db) { el.append(document.createElement("span")); return el; }
    const del = document.createElement("button"); del.type = "button"; del.className = "del";
    del.setAttribute("aria-label", "Excluir pagamento de " + r.pessoa);
    del.innerHTML = '<svg class="ico" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
    del.addEventListener("click", async () => {
      if (!del.classList.contains("armed")) { del.classList.add("armed"); toast("Toque de novo para excluir"); setTimeout(() => del.classList.remove("armed"), 3500); return; }
      del.disabled = true;
      try { await state.db.doc("recebimentos/" + r.id).delete(); toast("Pagamento excluído"); }
      catch (e) { del.disabled = false; toast("Não foi possível excluir agora.", true); }
    });
    el.append(del);
    return el;
  }
  document.querySelectorAll("[data-rcview]").forEach(b => b.addEventListener("click", () => {
    state.rcView = b.dataset.rcview;
    document.querySelectorAll("[data-rcview]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    syncSliders(); renderReceber();
  }));
  function personCard(pp, i, R) {
    const el = document.createElement("div"); el.className = "person" + (pp.pend ? "" : " ok"); el.style.animationDelay = Math.min(i, 10) * 50 + "ms";
    const head = document.createElement("div"); head.className = "ph";
    const av = document.createElement("span"); av.className = "av ter"; av.textContent = initials(pp.nome);
    const mid = document.createElement("div"); mid.className = "pm";
    const nm = document.createElement("b"); nm.textContent = pp.nome;
    const st = document.createElement("span"); st.className = "label";
    st.textContent = pp.pend ? pp.nPend + (pp.nPend === 1 ? " item pendente" : " itens pendentes")
      : pp.dueSum ? "Tudo pago até " + shortMonth(R) : pp.fut ? "Nada vencido ainda" : "Sem pendências";
    if (pp.credit > 0) st.textContent += " · " + money(pp.credit) + " pago adiantado";
    mid.append(nm, st);
    const right = document.createElement("div"); right.className = "pr";
    const v = document.createElement("b"); v.className = "num amt"; v.textContent = money(pp.pend);
    const vl = document.createElement("span"); vl.className = "label"; vl.textContent = pp.pend ? "pendente" : "em dia";
    right.append(v, vl);
    head.append(av, mid, right);
    const tr = document.createElement("div"); tr.className = "track"; const f = document.createElement("i"); tr.append(f);
    const pct = pp.dueSum ? Math.min(1, (pp.dueSum - pp.pend) / pp.dueSum) : (pp.fut ? 0 : 1);
    requestAnimationFrame(() => { f.style.width = pct * 100 + "%"; });
    const foot = document.createElement("div"); foot.className = "pfoot";
    const note = document.createElement("span"); note.className = "label";
    note.textContent = "Pagou " + money(pp.dueSum - pp.pend) + " de " + money(pp.dueSum) + (pp.fut ? " · " + money(pp.fut) + " a vencer" : "");
    const acts = document.createElement("div"); acts.className = "acts-row";
    const hb = document.createElement("button"); hb.type = "button"; hb.className = "btn btn-glass mini";
    const open = state.openPeople.has(pp.k);
    hb.textContent = open ? "Fechar histórico" : "Histórico"; hb.setAttribute("aria-expanded", String(open));
    const pay = document.createElement("button"); pay.type = "button"; pay.className = "btn btn-ink mini"; pay.textContent = "Recebi";
    pay.addEventListener("click", () => openRc(pp.nome));
    acts.append(hb, pay); foot.append(note, acts);
    const hist = document.createElement("div"); hist.className = "phist"; hist.hidden = !open;
    hb.addEventListener("click", () => {
      const now = hist.hidden; hist.hidden = !now;
      if (now) { state.openPeople.add(pp.k); if (!hist.childElementCount) fillHist(hist, pp, R); } else state.openPeople.delete(pp.k);
      hb.textContent = now ? "Fechar histórico" : "Histórico"; hb.setAttribute("aria-expanded", String(now));
    });
    if (open) fillHist(hist, pp, R);
    el.append(head, tr, foot, hist);
    return el;
  }
  function fillHist(box, pp, R) {
    const limit = shiftMonth(R, 3);
    const debts = pp.debts.filter(t => t.due <= limit);
    const hidden = pp.debts.length - debts.length;
    const rows = debts.map(t => ({ k: "d", t, key: t.data })).concat(pp.pays.map(r => ({ k: "p", r, key: r.data }))).sort((a, b) => b.key.localeCompare(a.key));
    const dd = d => d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(2, 4);
    rows.forEach(x => {
      const row = document.createElement("div"); row.className = "hrow";
      const d = document.createElement("span"); d.className = "d num";
      const t = document.createElement("span"); t.className = "t";
      const b = document.createElement("small");
      const v = document.createElement("span"); v.className = "v num";
      const s = document.createElement("span"); s.className = "st";
      if (x.k === "d") {
        const it = x.t, card = cardById(it.cartao);
        d.textContent = dd(it.data);
        t.textContent = it.descricao + (it.de ? " " + it.parcela + "/" + it.de : "");
        b.textContent = (card ? card.nome + " · fatura de " + shortMonth(it.due) : "Pix, dinheiro ou débito");
        t.append(b);
        v.textContent = money(it.valorCentavos);
        const restante = it.valorCentavos - it.cover;
        if (!restante) { s.textContent = "Pago"; s.classList.add("ok"); }
        else if (it.due > R) { s.textContent = it.cover ? "Faltam " + money(restante) : "Vence " + shortMonth(it.due); s.classList.add("fut"); }
        else if (it.cover) { s.textContent = "Faltam " + money(restante); s.classList.add("part"); }
        else { s.textContent = "Pendente"; s.classList.add("pend"); }
        row.append(d, t, v, s);
      } else {
        const r = x.r;
        row.classList.add("pay");
        d.textContent = dd(r.data);
        t.textContent = "Pagamento"; if (r.obs) { b.textContent = r.obs; t.append(b); }
        v.textContent = "+ " + money(r.valorCentavos); v.classList.add("in");
        row.append(d, t, v);
        if (!state.readOnly && state.db) {
          const del = twoStep("Apagar", "Confirmar", async () => { await state.db.doc("recebimentos/" + r.id).delete(); toast("Pagamento apagado"); });
          del.classList.add("st-btn"); row.append(del);
        } else row.append(s);
      }
      box.append(row);
    });
    if (hidden) { const m = document.createElement("p"); m.className = "hint"; m.textContent = "E mais " + hidden + (hidden === 1 ? " parcela" : " parcelas") + " nos meses seguintes."; box.append(m); }
  }

  /* opção "é de outra pessoa" no lançamento */
  function peopleChips(box, onPick, current) {
    box.textContent = "";
    knownPeople().slice(0, 8).forEach(n => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = n;
      b.setAttribute("aria-pressed", String(pkey(n) === pkey(current)));
      b.addEventListener("click", () => onPick(n));
      box.append(b);
    });
  }
  function paintTer() {
    const despesa = $("tDespesa").checked, on = state.ter;
    $("terToggle").setAttribute("aria-pressed", String(on));
    $("terTitle").textContent = despesa ? "É de outra pessoa" : "É pagamento de alguém que me devia";
    $("terSub").textContent = despesa ? "Ela vai te pagar. Entra na fatura, mas não conta como sua despesa." : "Não conta como receita. Abate do que a pessoa te deve.";
    $("terBox").hidden = !on;
    $("catField").hidden = on;
    $("descField").hidden = on && !despesa;
    if (on) {
      const pick = n => { $("fTer").value = n; paintTerChips(); };
      const paintTerChips = () => peopleChips($("terPeople"), pick, $("fTer").value);
      paintTerChips();
      if (!despesa) { $("addBtn").textContent = "Registrar pagamento recebido"; $("modalTitle").textContent = "Pagamento recebido"; }
      else $("modalTitle").textContent = state.forma === "parcelada" ? "Parcelada de outra pessoa" : state.forma === "fixa" ? "Fixa de outra pessoa" : "Despesa de outra pessoa";
    }
  }
  $("terToggle").addEventListener("click", () => {
    state.ter = !state.ter; paintForma();
    if (state.ter) setTimeout(() => $("fTer").focus(), 60);
  });
  $("fTer").addEventListener("input", () => peopleChips($("terPeople"), n => { $("fTer").value = n; paintTer(); }, $("fTer").value));

  /* registrar pagamento recebido */
  let rcLastFocus = null;
  function rcInfo() {
    const box = $("rcInfo"), k = pkey($("rcNome").value);
    const pp = k ? peopleData(state.mes > thisMonth ? state.mes : thisMonth).find(p => p.k === k) : null;
    peopleChips($("rcPeople"), n => { $("rcNome").value = n; rcInfo(); }, $("rcNome").value);
    box.textContent = "";
    if (!pp || !(pp.pend || pp.fut)) { box.hidden = true; return; }
    box.hidden = false;
    box.append(pp.nome + (pp.pend ? " te deve " + money(pp.pend) + " até agora" : " não tem nada vencido") + (pp.fut ? " · " + money(pp.fut) + " a vencer" : ""));
    if (pp.pend) {
      const use = document.createElement("button"); use.type = "button"; use.className = "linkbtn"; use.textContent = "Usar " + money(pp.pend);
      use.addEventListener("click", () => { $("rcValor").value = (pp.pend / 100).toFixed(2).replace(".", ","); $("rcValor").focus(); });
      box.append(document.createElement("br"), use);
    }
  }
  function openRc(nome) {
    rcLastFocus = document.activeElement;
    $("rcNome").value = nome || ""; $("rcValor").value = ""; $("rcObs").value = "";
    $("rcData").value = ymd(today);
    $("rcMsg").textContent = ""; $("rcMsg").className = "msg";
    rcInfo();
    $("rcOverlay").classList.add("open"); $("rcOverlay").setAttribute("aria-hidden", "false");
    setTimeout(() => (nome ? $("rcValor") : $("rcNome")).focus(), 80);
  }
  function closeRc() {
    $("rcOverlay").classList.remove("open"); $("rcOverlay").setAttribute("aria-hidden", "true");
    if (rcLastFocus && rcLastFocus.focus) rcLastFocus.focus();
  }
  function rcFail(text, el) {
    const m = $("rcMsg"); m.className = "msg err"; m.textContent = text;
    const md = $("rcModal"); md.classList.remove("shake"); void md.offsetWidth; md.classList.add("shake");
    if (el) el.focus();
  }
  $("rcNome").addEventListener("input", rcInfo);
  $("rcClose").addEventListener("click", closeRc);
  $("rcOverlay").addEventListener("click", e => { if (e.target === $("rcOverlay")) closeRc(); });
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-rcpay]"); if (b) openRc(b.dataset.rcpay); });
  $("rcForm").addEventListener("submit", async e => {
    e.preventDefault();
    const pessoa = canonName($("rcNome").value), valorCentavos = parseMoney($("rcValor").value), data = $("rcData").value;
    if (!pessoa) return rcFail("Escreva o nome de quem pagou.", $("rcNome"));
    if (valorCentavos <= 0) return rcFail("Informe um valor maior que zero, como 150,00.", $("rcValor"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return rcFail("Escolha a data do pagamento.", $("rcData"));
    if (!state.db) return rcFail("Entre na sua conta para salvar.");
    $("rcSave").disabled = true;
    try {
      await state.db.collection("recebimentos").add({ pessoa, valorCentavos, data, obs: $("rcObs").value.trim(), criadoEm: new Date().toISOString() });
      toast(pessoa + " te pagou " + money(valorCentavos));
      closeRc();
    } catch (err) {
      rcFail(navigator.onLine ? "Não deu para salvar agora. Tente de novo em instantes." : "Sem internet. Conecte-se para salvar.");
    } finally { $("rcSave").disabled = false; }
  });

  /* ---------- filtros de busca de cada tela ---------- */
  // busca sem acento e sem diferenciar maiúsculas; várias palavras precisam aparecer todas
  function fnorm(x) { return String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function fhit(q, text) {
    const n = fnorm(q).trim();
    if (!n) return true;
    const hay = fnorm(text);
    return n.split(/\s+/).every(w => hay.includes(w));
  }
  function txText(t) {
    const card = cardById(t.cartao);
    return [t.descricao, t.categoria, card && card.nome, t.terceiro, t.tipo === "receita" ? "receita entrada" : "despesa saida",
      money(t.valorCentavos), t.data && ddmm(t.data), t.de ? t.parcela + "/" + t.de : ""].filter(Boolean).join(" ");
  }
  const fbActive = key => Object.values(state.f[key] || {}).some(Boolean);
  const cardOpts = () => [["", "Qualquer pagamento"], ["none", "Pix, dinheiro ou débito"]].concat(state.cards.map(c => [c.id, c.nome]));
  const catOpts = () => [["", "Todas as categorias"]].concat(CATS.despesa.concat(CATS.receita).map(c => [c, c]));
  var FB = {
    visao: { ph: "Buscar no mês…", sel: [{ k: "tipo", label: "Tipo", opts: () => [["", "Tudo"], ["receita", "Receitas"], ["despesa", "Despesas"], ["ter", "De outras pessoas"]] }], draw: () => renderRecent() },
    orcamento: { ph: "Buscar categoria…", sel: [{ k: "st", label: "Situação", opts: () => [["", "Todas"], ["gasto", "Com gastos"], ["lim", "Com limite"], ["sem", "Sem limite"], ["perto", "Perto do limite"], ["over", "Estouradas"]] }], draw: () => renderBudget() },
    parcelas: { ph: "Buscar parcelamento…", sel: [
      { k: "st", label: "Situação", opts: () => [["", "Todos"], ["ativo", "Em andamento"], ["fim", "Encerrados"]] },
      { k: "forma", label: "Tipo", opts: () => [["", "Parceladas e fixas"], ["parcelada", "Só parceladas"], ["fixa", "Só fixas"]] },
      { k: "cartao", label: "Pagamento", opts: cardOpts }], draw: () => renderPlans() },
    cartoes: { ph: "Buscar na fatura…", sel: [
      { k: "de", label: "De quem", opts: () => [["", "Todas as compras"], ["eu", "Só minhas"], ["ter", "De outras pessoas"]] },
      { k: "cat", label: "Categoria", opts: catOpts }], draw: () => renderFatura() },
    pessoas: { ph: "Buscar pessoa…", sel: [{ k: "st", label: "Situação", opts: () => [["", "Todas"], ["pend", "Com pendência"], ["fut", "Com parcelas a vencer"], ["ok", "Em dia"]] }], draw: () => renderReceber() },
    rclanc: { ph: "Buscar lançamento…", sel: [{ k: "tipo", label: "Tipo", opts: () => [["", "Compras e pagamentos"], ["d", "Só compras"], ["p", "Só pagamentos"]] }], draw: () => renderRcLanc() },
    extrato: { sel: [
      { k: "cat", label: "Categoria", opts: catOpts },
      { k: "cartao", label: "Pagamento", opts: cardOpts },
      { k: "de", label: "De quem", opts: () => [["", "Meus e de outras pessoas"], ["eu", "Só meus"], ["ter", "Só de outras pessoas"]] }], draw: () => renderActs() }
  };
  const SEARCH_ICO = '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  function buildFbars() {
    document.querySelectorAll("[data-fbar]").forEach(el => {
      const key = el.dataset.fbar, cfg = FB[key], f = state.f[key];
      el.textContent = "";
      const clear = document.createElement("button"); clear.type = "button"; clear.className = "fclear"; clear.textContent = "Limpar";
      const paint = () => { clear.hidden = !fbActive(key) && !(key === "extrato" && (state.q || state.kind !== "todos")); el.classList.toggle("active", fbActive(key)); };
      if (cfg.ph) {
        const lab = document.createElement("label"); lab.className = "search";
        lab.innerHTML = SEARCH_ICO + '<span class="sr">' + cfg.ph.replace("…", "") + "</span>";
        const inp = document.createElement("input"); inp.type = "search"; inp.placeholder = cfg.ph; inp.autocomplete = "off"; inp.value = f.q;
        let t;
        inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f.q = inp.value; cfg.draw(); paint(); }, 120); });
        lab.append(inp); el.append(lab);
      }
      cfg.sel.forEach(sc => {
        const sel = document.createElement("select"); sel.className = "fsel"; sel.dataset.k = sc.k; sel.setAttribute("aria-label", sc.label);
        sel.addEventListener("change", () => { f[sc.k] = sel.value; sel.classList.toggle("on", !!sel.value); cfg.draw(); paint(); });
        el.append(sel);
      });
      clear.addEventListener("click", () => {
        Object.keys(f).forEach(k => { f[k] = ""; });
        el.querySelectorAll("input").forEach(i => { i.value = ""; });
        el.querySelectorAll("select").forEach(s2 => { s2.value = ""; s2.classList.remove("on"); });
        if (key === "extrato") { state.q = ""; $("q").value = ""; const all = document.querySelector('[data-kind="todos"]'); if (all) all.click(); }
        cfg.draw(); paint();
      });
      el.append(clear);
      el._paint = paint;
      paint();
    });
    syncFbars();
  }
  // as opções que dependem dos dados (cartões) se atualizam sem perder a escolha
  function syncFbars() {
    if (!FB) return;
    document.querySelectorAll("[data-fbar] select").forEach(sel => {
      const key = sel.closest("[data-fbar]").dataset.fbar, sc = FB[key].sel.find(x => x.k === sel.dataset.k);
      // sem filtro, a caixa mostra só o nome dela ("Categoria", "Pagamento"…)
      const opts = sc.opts().map(o => o[0] === "" ? ["", sc.label] : o), sig = JSON.stringify(opts);
      if (sel.dataset.sig !== sig) {
        sel.dataset.sig = sig; sel.textContent = "";
        opts.forEach(([v, l]) => sel.add(new Option(l, v)));
        if (!opts.some(o => o[0] === state.f[key][sc.k])) state.f[key][sc.k] = "";
      }
      sel.value = state.f[key][sc.k];
      sel.classList.toggle("on", !!sel.value);
    });
  }
  buildFbars();
  // a busca e o filtro de tipo que o extrato já tinha também acendem o "Limpar"
  $("q").addEventListener("input", () => setTimeout(() => { const el = document.querySelector('[data-fbar="extrato"]'); el && el._paint && el._paint(); }, 150));
  document.querySelectorAll("[data-kind]").forEach(b => b.addEventListener("click", () => { const el = document.querySelector('[data-fbar="extrato"]'); el && el._paint && el._paint(); }));

  const clearBtn = $("clearExamples");
  clearBtn.addEventListener("click", async () => {
    if (!clearBtn.dataset.armed) {
      clearBtn.dataset.armed = "1"; clearBtn.textContent = "Confirmar: apagar exemplos";
      setTimeout(() => { delete clearBtn.dataset.armed; clearBtn.textContent = "Apagar exemplos"; }, 4000);
      return;
    }
    clearBtn.disabled = true; clearBtn.textContent = "Apagando…";
    try {
      for (const t of state.real.filter(t => t.exemplo)) await state.db.doc("lancamentos/" + t.id).delete();
      for (const p of state.plans.filter(p => p.exemplo)) await state.db.doc("planos/" + p.id).delete();
      for (const c of state.cards.filter(c => c.exemplo)) await state.db.doc("cartoes/" + c.id).delete();
      toast("Exemplos apagados");
    }
    catch (e) { toast("Alguns exemplos não foram apagados.", true); }
    clearBtn.disabled = false; delete clearBtn.dataset.armed; clearBtn.textContent = "Apagar exemplos";
  });

  let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { renderChart(); syncSliders(); }, 120); });
  document.fonts && document.fonts.ready.then(syncSliders);

  render(); route();

  // usado pelo importador de planilhas (importar.js)
  window.FinApp = {
    state, CATS, CARD_COLORS, toast, money,
    goMonth(ym) { if (ym) { state.mes = ym; render(); } }
  };

  /* ---------- dados ---------- */
  $("accountBtn").addEventListener("click", () => { if (window.FinDB) window.FinDB.openAccount(); });
  (async () => {
    if (!window.FinDB) { state.loaded = true; setStatus("Não foi possível iniciar o app. Feche e abra de novo."); render(); return; }
    const db = await window.FinDB.ready();
    state.db = db;
    const timer = setTimeout(() => { if (!state.loaded) setStatus("Ainda não consegui carregar seus dados. Verifique a internet; o app continua tentando."); }, 10000);
    db.collection("lancamentos").onSnapshot(snap => {
      state.real = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(t => typeof t.valorCentavos === "number");
      if (!snap.metadata.fromCache) { clearTimeout(timer); setStatus(""); }
      state.loaded = true; render();
    }, () => { clearTimeout(timer); state.loaded = true; setStatus("Não foi possível carregar os lançamentos. Feche e abra o app de novo."); render(); });
    db.collection("cartoes").onSnapshot(snap => {
      state.cards = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(c => typeof c.nome === "string");
      render();
      if ($("overlay").classList.contains("open")) { paintPay(); updatePreview(); }
    }, () => {});
    db.collection("pagamentos").onSnapshot(snap => {
      state.pagos = new Set(snap.docs.map(d => d.id));
      render();
    }, () => {});
    db.collection("planos").onSnapshot(snap => {
      state.plans = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(p => typeof p.valorCentavos === "number" && typeof p.inicio === "string");
      render();
    }, () => {});
    db.collection("recebimentos").onSnapshot(snap => {
      state.recs = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(r => typeof r.valorCentavos === "number" && typeof r.data === "string");
      render();
      if ($("rcOverlay").classList.contains("open")) rcInfo();
    }, () => {});
    db.doc("config/orcamento").onSnapshot(s => {
      state.limites = (s.exists && s.data().limites) || {};
      if (!state.editingCat) render();
    }, () => {});
  })();
})();
