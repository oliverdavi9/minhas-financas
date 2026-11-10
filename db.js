/*
 * Minhas Finanças — camada de dados.
 * Guarda tudo no Supabase (tabela "docs", uma linha por registro, protegida por RLS)
 * e mantém uma cópia no aparelho para o app abrir rápido e funcionar sem internet.
 * Expõe a mesma interface que as telas usam: collection(nome).onSnapshot/add,
 * doc("colecao/id").set/update/delete/onSnapshot.
 */
(function () {
  "use strict";
  const COLS = ["lancamentos", "planos", "cartoes", "pagamentos", "config"];
  const maps = {};
  COLS.forEach(c => { maps[c] = new Map(); });
  const colL = {}, docL = {};
  let sb = null, uid = null, email = "", fetched = false, hasCache = false, channel = null, readyResolve;
  const readyP = new Promise(r => { readyResolve = r; });

  /* ---------- utilidades ---------- */
  const $ = id => document.getElementById(id);
  const ensure = col => { if (!maps[col]) maps[col] = new Map(); return maps[col]; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const newId = () => ((crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) || (Date.now().toString(36) + Math.random().toString(36).slice(2))).slice(0, 20);
  const dbError = (code, message) => ({ code, message });
  function getConfig() {
    const c = window.SUPABASE_CONFIG || {};
    if (c.url && c.anonKey) return c;
    try { const s = JSON.parse(localStorage.getItem("mf:config") || "null"); if (s && s.url && s.anonKey) return s; } catch (e) {}
    return null;
  }
  const lsKey = col => "mf:cache:" + uid + ":" + col;
  function saveCache(col) { try { localStorage.setItem(lsKey(col), JSON.stringify([...ensure(col)])); } catch (e) {} }
  function loadCache() {
    COLS.forEach(c => {
      try { const raw = localStorage.getItem(lsKey(c)); if (raw !== null) hasCache = true; maps[c] = new Map(JSON.parse(raw || "[]")); }
      catch (e) { maps[c] = new Map(); }
    });
  }

  /* ---------- leitura e avisos ---------- */
  function snapCol(col, fromCache) {
    const docs = [...ensure(col)].map(([id, data]) => ({ id, exists: true, data: () => data }));
    return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: !!fromCache, hasPendingWrites: false } };
  }
  function snapDoc(col, id, fromCache) {
    const d = ensure(col).get(id);
    return { id, exists: d !== undefined, data: () => d, metadata: { fromCache: !!fromCache, hasPendingWrites: false } };
  }
  function emit(col, fromCache) {
    (colL[col] || []).forEach(fn => { try { fn(snapCol(col, fromCache)); } catch (e) { console.error(e); } });
    Object.keys(docL).forEach(k => {
      if (!k.startsWith(col + "/")) return;
      docL[k].forEach(fn => { try { fn(snapDoc(col, k.slice(col.length + 1), fromCache)); } catch (e) { console.error(e); } });
    });
  }
  const emitAll = fromCache => Object.keys(maps).forEach(c => emit(c, fromCache));

  async function fetchAll() {
    if (!sb || !uid) return;
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("docs").select("colecao,id,data").range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    Object.keys(maps).forEach(c => { maps[c] = new Map(); });
    rows.forEach(r => ensure(r.colecao).set(r.id, r.data));
    Object.keys(maps).forEach(saveCache);
    fetched = true;
    emitAll(false);
  }
  let refetchT = null;
  const refetchSoon = () => { clearTimeout(refetchT); refetchT = setTimeout(() => fetchAll().catch(() => {}), 300); };

  function subscribe() {
    channel = sb.channel("docs-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "docs", filter: "user_id=eq." + uid }, payload => {
        const row = payload.eventType === "DELETE" ? payload.old : payload.new;
        if (!row || !row.colecao) { refetchSoon(); return; }
        if (payload.eventType === "DELETE") ensure(row.colecao).delete(row.id);
        else ensure(row.colecao).set(row.id, row.data);
        saveCache(row.colecao); emit(row.colecao, false);
      })
      .subscribe(status => { if (status === "SUBSCRIBED" && fetched) refetchSoon(); });
  }

  /* ---------- escrita (otimista: aparece na hora, desfaz se falhar) ---------- */
  async function write(col, id, data) {
    const m = ensure(col), prev = m.get(id);
    m.set(id, data); saveCache(col); emit(col, false);
    const { error } = await sb.from("docs").upsert({ user_id: uid, colecao: col, id, data, updated_at: new Date().toISOString() });
    if (error) {
      if (prev === undefined) m.delete(id); else m.set(id, prev);
      saveCache(col); emit(col, false);
      throw dbError("unavailable", navigator.onLine ? error.message : "Sem internet");
    }
  }
  async function remove(col, id) {
    const m = ensure(col), prev = m.get(id);
    m.delete(id); saveCache(col); emit(col, false);
    const { error } = await sb.from("docs").delete().match({ colecao: col, id });
    if (error) {
      if (prev !== undefined) { m.set(id, prev); saveCache(col); emit(col, false); }
      throw dbError("unavailable", navigator.onLine ? error.message : "Sem internet");
    }
  }
  function docRef(col, id) {
    return {
      id, path: col + "/" + id,
      get: async () => snapDoc(col, id, !fetched),
      set: data => write(col, id, clone(data)),
      update: data => {
        const cur = ensure(col).get(id);
        if (cur === undefined) return Promise.reject(dbError("invalid_argument", "Registro não encontrado"));
        return write(col, id, Object.assign({}, cur, clone(data)));
      },
      delete: () => remove(col, id),
      onSnapshot(next) {
        const k = col + "/" + id;
        (docL[k] = docL[k] || new Set()).add(next);
        if (fetched || hasCache) next(snapDoc(col, id, !fetched));
        return () => docL[k].delete(next);
      },
      collection(sub) { return collRef(col + "/" + id + "/" + sub); }
    };
  }
  function collRef(col) {
    return {
      path: col,
      doc: id => docRef(col, id || newId()),
      add: async data => { const id = newId(); await write(col, id, clone(data)); return docRef(col, id); },
      onSnapshot(next) {
        (colL[col] = colL[col] || new Set()).add(next);
        if (fetched || hasCache) next(snapCol(col, !fetched));
        return () => colL[col].delete(next);
      }
    };
  }
  const api = {
    collection: collRef,
    doc(path) { const i = path.lastIndexOf("/"); return docRef(path.slice(0, i), path.slice(i + 1)); }
  };

  /* ---------- telas de acesso, conta e backup ---------- */
  function overlay(id, inner) {
    let o = $(id);
    if (!o) { o = document.createElement("div"); o.id = id; o.className = "overlay gate"; document.body.append(o); }
    o.innerHTML = '<div class="modal glass" role="dialog" aria-modal="true">' + inner + "</div>";
    o.classList.add("open"); o.setAttribute("aria-hidden", "false");
    return o;
  }
  function close(id) { const o = $(id); if (o) { o.classList.remove("open"); o.setAttribute("aria-hidden", "true"); } }
  function msg(id, text, bad) { const m = $(id); if (m) { m.className = "msg" + (bad ? " err" : ""); m.textContent = text; } }
  const BRAND = '<div class="gate-brand"><div class="logo">M</div><div><h2>Minhas Finanças</h2><p class="hint" id="gSub"></p></div></div>';

  function showSetup(prefill) {
    overlay("gate", BRAND +
      '<form id="gSetup" novalidate style="display:grid;gap:14px">' +
      '<p class="hint">Cole os dados do seu projeto Supabase (Project Settings → API). Isso só é feito uma vez neste aparelho.</p>' +
      '<div class="field"><label for="gUrl">Project URL</label><input id="gUrl" inputmode="url" autocomplete="off" placeholder="https://xxxx.supabase.co"></div>' +
      '<div class="field"><label for="gKey">anon public key</label><input id="gKey" autocomplete="off" placeholder="eyJhbGciOi…"></div>' +
      '<button class="btn btn-accent" type="submit" style="padding:13px">Conectar</button>' +
      '<p class="msg" id="gMsg" role="status"></p></form>');
    $("gSub").textContent = "Primeiro acesso";
    if (prefill) { $("gUrl").value = prefill.url || ""; $("gKey").value = prefill.anonKey || ""; }
    $("gSetup").addEventListener("submit", e => {
      e.preventDefault();
      const url = $("gUrl").value.trim().replace(/\/+$/, ""), anonKey = $("gKey").value.trim();
      if (!/^https:\/\/.+/.test(url)) return msg("gMsg", "Cole a Project URL completa, começando com https://", true);
      if (anonKey.length < 30) return msg("gMsg", "Cole a chave anon public inteira.", true);
      try { localStorage.setItem("mf:config", JSON.stringify({ url, anonKey })); } catch (err) {}
      start();
    });
  }

  function showLogin(mode) {
    const signup = mode === "signup";
    overlay("gate", BRAND +
      '<form id="gLogin" novalidate style="display:grid;gap:14px">' +
      '<div class="field"><label for="gEmail">E-mail</label><input id="gEmail" type="email" inputmode="email" autocomplete="username" autocapitalize="off"></div>' +
      '<div class="field"><label for="gPass">Senha</label><input id="gPass" type="password" autocomplete="' + (signup ? "new-password" : "current-password") + '" minlength="6"></div>' +
      '<button class="btn btn-accent" id="gGo" type="submit" style="padding:13px">' + (signup ? "Criar conta" : "Entrar") + "</button>" +
      '<button class="linkbtn" id="gSwitch" type="button">' + (signup ? "Já tenho conta, quero entrar" : "Ainda não tenho conta") + "</button>" +
      '<p class="msg" id="gMsg" role="status"></p></form>');
    $("gSub").textContent = signup ? "Crie sua conta para guardar seus dados com segurança." : "Entre para ver e lançar suas contas.";
    $("gSwitch").addEventListener("click", () => showLogin(signup ? "login" : "signup"));
    setTimeout(() => $("gEmail").focus(), 60);
    $("gLogin").addEventListener("submit", async e => {
      e.preventDefault();
      const em = $("gEmail").value.trim(), pw = $("gPass").value;
      if (!/^\S+@\S+\.\S+$/.test(em)) return msg("gMsg", "Digite um e-mail válido.", true);
      if (pw.length < 6) return msg("gMsg", "A senha precisa ter pelo menos 6 caracteres.", true);
      $("gGo").disabled = true; msg("gMsg", signup ? "Criando conta…" : "Entrando…");
      try {
        if (signup) {
          const { data, error } = await sb.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) { msg("gMsg", "Conta criada. Abra o e-mail de confirmação que enviamos e depois volte aqui para entrar."); showLoginAfterSignup(em); return; }
          onSession(data.session);
        } else {
          const { data, error } = await sb.auth.signInWithPassword({ email: em, password: pw });
          if (error) throw error;
          onSession(data.session);
        }
      } catch (err) {
        const t = String(err && err.message || "");
        msg("gMsg", /invalid login/i.test(t) ? "E-mail ou senha incorretos." :
          /not confirmed/i.test(t) ? "Confirme seu e-mail pelo link que enviamos e tente de novo." :
          /already registered/i.test(t) ? "Esse e-mail já tem conta. Toque em “Já tenho conta”." :
          !navigator.onLine ? "Sem internet. Conecte-se para entrar." : "Não foi possível agora: " + t, true);
      } finally { const b = $("gGo"); if (b) b.disabled = false; }
    });
  }
  function showLoginAfterSignup(em) {
    setTimeout(() => { showLogin("login"); $("gEmail").value = em; msg("gMsg", "Depois de confirmar o e-mail, digite sua senha e entre."); }, 2500);
  }

  function exportData() {
    const dados = {};
    Object.keys(maps).forEach(c => { dados[c] = Object.fromEntries(maps[c]); });
    return { app: "minhas-financas", versao: 1, exportadoEm: new Date().toISOString(), dados };
  }
  async function shareBackup() {
    const name = "minhas-financas-" + new Date().toISOString().slice(0, 10) + ".json";
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Backup Minhas Finanças" }); msg("aMsg", "Backup pronto. Salve em Arquivos ou envie para você."); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    msg("aMsg", "Backup baixado: " + name);
  }
  async function importBackup(obj) {
    const rows = [];
    Object.keys(obj.dados || {}).forEach(c => Object.keys(obj.dados[c] || {}).forEach(id => {
      rows.push({ user_id: uid, colecao: c, id, data: obj.dados[c][id], updated_at: new Date().toISOString() });
    }));
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await sb.from("docs").upsert(rows.slice(i, i + 400));
      if (error) throw error;
    }
    await fetchAll();
    return rows.length;
  }

  function openAccount() {
    if (!sb) return start();
    const signed = !!uid;
    overlay("account",
      '<div class="modal-head"><h2>Sua conta</h2><button class="round" type="button" id="aClose" aria-label="Fechar"><svg class="ico" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' +
      '<p class="hint" id="aWho"></p>' +
      '<div style="display:grid;gap:10px">' +
      '<button class="btn btn-glass" id="aSync" type="button">Atualizar dados agora</button>' +
      '<button class="btn btn-glass" id="aTheme" type="button">Alternar tema claro e escuro</button>' +
      '<button class="btn btn-glass" id="aExport" type="button">Exportar backup</button>' +
      '<label class="btn btn-glass" for="aFile" style="cursor:pointer">Importar backup<input id="aFile" type="file" accept="application/json,.json" hidden></label>' +
      '<button class="btn btn-glass" id="aImportGo" type="button" hidden></button>' +
      '<button class="btn btn-ink" id="aOut" type="button">Sair da conta</button>' +
      '</div><p class="msg" id="aMsg" role="status"></p>');
    $("aWho").textContent = signed ? "Conectado como " + email + ". Seus dados ficam sincronizados entre todos os aparelhos em que você entrar." : "Você não está conectado.";
    $("aClose").addEventListener("click", () => close("account"));
    $("account").addEventListener("click", e => { if (e.target === $("account")) close("account"); });
    $("aSync").addEventListener("click", async () => { msg("aMsg", "Atualizando…"); try { await fetchAll(); msg("aMsg", "Dados atualizados."); } catch (e) { msg("aMsg", "Sem conexão com o servidor agora.", true); } });
    $("aExport").addEventListener("click", shareBackup);
    $("aTheme").addEventListener("click", () => { const t = $("themeBtn"); if (t) t.click(); });
    let pending = null;
    $("aFile").addEventListener("change", async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        if (!obj || obj.app !== "minhas-financas" || !obj.dados) throw new Error("formato");
        const n = Object.values(obj.dados).reduce((s, c) => s + Object.keys(c || {}).length, 0);
        pending = obj;
        const b = $("aImportGo"); b.hidden = false; b.className = "btn btn-accent"; b.textContent = "Importar " + n + " registros (substitui os de mesmo código)";
        msg("aMsg", "Confira e toque no botão para importar.");
      } catch (err) { msg("aMsg", "Esse arquivo não é um backup do Minhas Finanças.", true); }
    });
    $("aImportGo").addEventListener("click", async () => {
      if (!pending) return;
      const b = $("aImportGo"); b.disabled = true; msg("aMsg", "Importando…");
      try { const n = await importBackup(pending); msg("aMsg", n + " registros importados."); b.hidden = true; pending = null; }
      catch (e) { msg("aMsg", "A importação falhou. Verifique a internet e tente de novo.", true); }
      finally { b.disabled = false; }
    });
    const out = $("aOut");
    out.addEventListener("click", async () => {
      if (!out.dataset.armed) { out.dataset.armed = "1"; out.textContent = "Toque de novo para sair"; setTimeout(() => { delete out.dataset.armed; out.textContent = "Sair da conta"; }, 4000); return; }
      try { Object.keys(maps).forEach(c => localStorage.removeItem(lsKey(c))); } catch (e) {}
      await sb.auth.signOut();
      location.reload();
    });
  }

  /* ---------- início ---------- */
  function onSession(session) {
    if (uid) return;
    uid = session.user.id; email = session.user.email || "";
    close("gate");
    loadCache();
    readyResolve(api);
    if (hasCache) emitAll(true);
    fetchAll().catch(e => console.warn("Sem conexão com o Supabase agora", e));
    subscribe();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refetchSoon(); });
    window.addEventListener("online", refetchSoon);
  }
  async function start() {
    const cfg = getConfig();
    if (!cfg) return showSetup();
    if (!window.supabase || !window.supabase.createClient) {
      overlay("gate", BRAND + '<p class="msg err">Não consegui carregar o app. Conecte-se à internet e abra de novo.</p>');
      return;
    }
    try { sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "mf-auth" } }); }
    catch (e) { return showSetup(cfg); }
    const { data } = await sb.auth.getSession();
    if (data && data.session) onSession(data.session); else showLogin("login");
    sb.auth.onAuthStateChange((ev, session) => { if (session && !uid) onSession(session); });
  }

  window.FinDB = { ready: () => readyP, openAccount, refresh: () => fetchAll() };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
