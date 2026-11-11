/*
 * Minhas Finanças — importar planilha (Excel, Numbers, Google Planilhas ou CSV).
 * Lê o arquivo no próprio aparelho, reconhece as colunas, mostra uma prévia
 * e só então grava: lançamentos, compras parceladas (viram parcelamentos que
 * continuam nos meses seguintes) e cartões novos. Toda importação pode ser desfeita.
 */
(function () {
  "use strict";
  const LIB = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, "0");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const normH = s => norm(s).replace(/[^a-z0-9\/ ]/g, " ").replace(/\s+/g, " ").trim();
  const shiftMonth = (ym, d) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return x.getFullYear() + "-" + pad(x.getMonth() + 1); };
  const clampDay = (ym, day) => { const [y, m] = ym.split("-").map(Number); return ym + "-" + pad(Math.max(1, Math.min(day, new Date(y, m, 0).getDate()))); };
  const fmtYm = ym => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").replace(" de ", "/"); };
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const money = c => brl.format(c / 100);
  const thisYear = new Date().getFullYear();

  /* ---------- biblioteca de leitura (baixada só quando precisa) ---------- */
  let libP = null;
  function loadLib() {
    if (window.XLSX) return Promise.resolve();
    if (!libP) libP = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = LIB; s.async = true;
      s.onload = () => res(); s.onerror = () => { libP = null; s.remove(); rej(new Error("lib")); };
      document.head.append(s);
    });
    return libP;
  }

  /* ---------- reconhecimento de colunas ---------- */
  const ROLES = [
    ["data", "Data", ["data", "dia", "date", "data da compra", "data compra", "dt", "data lancamento", "data do lancamento", "data de lancamento", "data pagamento", "data de pagamento", "data do pagamento", "quando", "data movimento", "mes", "mes/ano", "mes ano", "competencia", "vencimento", "data de vencimento"]],
    ["descricao", "Descrição", ["descricao", "historico", "item", "itens", "lancamento", "nome", "estabelecimento", "detalhe", "detalhes", "produto", "compra", "titulo", "referencia", "despesa / receita", "local", "conta a pagar", "contas"]],
    ["valor", "Valor", ["valor", "valores", "quantia", "montante", "total", "preco", "valor total", "valor r", "r", "valor em r", "valor da parcela", "valor parcela", "amount", "custo"]],
    ["entrada", "Coluna de entradas", ["entrada", "entradas", "receita", "receitas", "recebido", "recebimentos", "creditos", "ganho", "ganhos"]],
    ["saida", "Coluna de saídas", ["saida", "saidas", "despesa", "despesas", "gasto", "gastos", "debitos", "pagos", "valor pago"]],
    ["tipo", "Tipo (receita ou despesa)", ["tipo", "natureza", "movimento", "entrada/saida", "e/s", "tipo de lancamento", "receita/despesa", "despesa/receita", "operacao"]],
    ["categoria", "Categoria", ["categoria", "categorias", "grupo", "classificacao", "classe", "tipo de gasto", "tipo de despesa", "centro de custo", "subcategoria"]],
    ["cartao", "Cartão / forma de pagamento", ["cartao", "cartoes", "cartao de credito", "forma de pagamento", "forma pagamento", "forma de pgto", "pagamento", "meio de pagamento", "meio", "conta", "banco", "forma", "pago com", "pgto", "fonte"]],
    ["parcela", "Parcela (como 3/10)", ["parcela", "parcelas", "n parcela", "no parcela", "n da parcela", "parc", "parcelamento", "qtd parcelas", "quantidade de parcelas", "prestacao", "prestacoes", "n de parcelas"]]
  ];
  const ROLE_KEYS = ROLES.map(r => r[0]);
  const MONTHS = [
    ["jan", "janeiro", "january"], ["fev", "fevereiro", "feb", "february"], ["mar", "marco", "march"], ["abr", "abril", "apr", "april"],
    ["mai", "maio", "may"], ["jun", "junho", "june"], ["jul", "julho", "july"], ["ago", "agosto", "aug", "august"],
    ["set", "setembro", "sep", "sept", "september"], ["out", "outubro", "oct", "october"], ["nov", "novembro", "november"], ["dez", "dezembro", "dec", "december"]
  ];
  const MONTH_RE = new RegExp("(^|[^a-z])(" + MONTHS.flat().sort((a, b) => b.length - a.length).join("|") + ")(?![a-z])");
  const monthIdx = w => { const n = norm(w).replace(/\.$/, ""); const i = MONTHS.findIndex(a => a.includes(n)); return i < 0 ? 0 : i + 1; };

  function roleScore(h, syns) {
    const n = normH(h);
    if (!n || n.length > 40) return 0;
    let best = 0;
    for (const s of syns) {
      if (n === s) return 3;
      if (s.length >= 4 && (n.startsWith(s + " ") || n.endsWith(" " + s) || n.includes(" " + s + " "))) best = 2;
    }
    return best;
  }
  function autoMap(cells) {
    const cand = [];
    cells.forEach((h, c) => {
      if (typeof h !== "string") return;
      ROLES.forEach(([k, , syns], ri) => { const sc = roleScore(h, syns); if (sc) cand.push({ sc, ri, k, c }); });
    });
    cand.sort((a, b) => b.sc - a.sc || a.ri - b.ri || a.c - b.c);
    const map = {}, used = new Set();
    for (const x of cand) if (map[x.k] === undefined && !used.has(x.c)) { map[x.k] = x.c; used.add(x.c); }
    return map;
  }

  /* ---------- leitura de valores ---------- */
  function serialToYmd(n) {
    const p = window.XLSX && XLSX.SSF.parse_date_code(n);
    return p && p.y > 1900 ? p.y + "-" + pad(p.m) + "-" + pad(p.d) : null;
  }
  function mkDate(y, m, d) {
    if (y < 100) y += 2000;
    if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return clampDay(y + "-" + pad(m), d);
  }
  // datas: célula de data do Excel, número de série, "05/03/2025", "05/03", "2025-03-05", "5 mar 2025", ou só o dia (em abas de mês)
  function parseDate(v, ctx) {
    if (v && v.d) return v.d;
    if (typeof v === "number") {
      if (v > 20000 && v < 80000) return serialToYmd(v);
      if (v >= 1 && v <= 31 && Number.isInteger(v) && ctx.ym) return clampDay(ctx.ym, v);
      return null;
    }
    const s = norm(v);
    if (!s) return null;
    const yCtx = ctx.ym ? Number(ctx.ym.slice(0, 4)) : ctx.year;
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return mkDate(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?(?!\d)/);
    if (m) return mkDate(m[3] ? +m[3] : yCtx, +m[2], +m[1]);
    m = s.match(/^(\d{1,2})\s*(?:de\s*)?([a-z]{3,9})\.?(?:\s*(?:de\s*)?[\/-]?\s*(\d{2,4}))?/);
    if (m && monthIdx(m[2])) return mkDate(m[3] ? +m[3] : yCtx, monthIdx(m[2]), +m[1]);
    m = s.match(/^([a-z]{3,9})\.?\s*(?:de\s*)?[\/-]?\s*(\d{2,4})$/);
    if (m && monthIdx(m[1])) return mkDate(+m[2], monthIdx(m[1]), 1);
    if (/^\d{1,2}$/.test(s) && ctx.ym) return clampDay(ctx.ym, +s);
    if (/^[a-z]{3,9}\.?$/.test(s) && monthIdx(s)) return mkDate(yCtx, monthIdx(s), 1);
    return null;
  }
  // valores: 1234.5, "R$ 1.234,56", "-50", "(50,00)", "1,234.56"
  function toCents(v) {
    if (typeof v === "number") return isFinite(v) ? Math.round(v * 100) : null;
    if (v == null || typeof v === "object") return null;
    let s = String(v).trim();
    if (!s || !/\d/.test(s) || /[a-df-qs-z]{3,}/i.test(s.replace(/r\$|brl/ig, ""))) return null;
    const neg = /^\(.*\)$/.test(s) || /^-|^r\$\s*-|-\s*$/i.test(s);
    s = s.replace(/[^\d,.]/g, "");
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc >= 0) s = (s.match(/,/g).length > 1) ? s.replace(/,/g, "") : s.replace(",", ".");
    else if (ld >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return Math.round(n * 100) * (neg ? -1 : 1);
  }
  const isText = v => typeof v === "string" && v.trim() !== "" && toCents(v) === null;
  const SKIP_RE = /^(sub ?total|total|saldo|soma|resultado|balanco|sobra|resumo|media)\b/;
  const SEC_IN = /^(receitas?|entradas?|rendas?|ganhos?|rendimentos?)\b/;
  const SEC_OUT = /^(despesas?|saidas?|gastos?|custos?|contas?( fixas| variaveis| a pagar)?)\b/;
  const SEC_ONLY = /^(receitas?|entradas?|rendas?|ganhos?|despesas?|saidas?|gastos?|custos?|contas?)( (totais|total|fixas?|variaveis|mensais|do mes|a pagar))?$/;

  // "3/10", "03 de 10", "parc 3/10", "10x" (só a quantidade)
  function parseParcela(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v >= 2 && v <= 120 && Number.isInteger(v) ? { k: 1, N: v, soN: true } : null;
    const s = norm(v);
    let m = s.match(/(\d{1,3})\s*(?:\/|de|of|-)\s*(\d{1,3})/);
    if (m) { const k = +m[1], N = +m[2]; return N >= 2 && k >= 1 && k <= N && N <= 120 ? { k, N } : null; }
    m = s.match(/^(\d{1,3})\s*x?$/);
    if (m && +m[1] >= 2 && +m[1] <= 120) return { k: 1, N: +m[1], soN: true };
    return null;
  }
  // parcela escrita na descrição: "Notebook 3/10", "MAGALU PARC 03/12", "Geladeira (2 de 10)"
  const DESC_PARC = /\s*[(\[]?\s*(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*[)\]]?\s*$/i;
  function splitDescParcela(desc) {
    const m = desc.match(DESC_PARC);
    if (!m) return null;
    const k = +m[1], N = +m[2];
    if (!(N >= 2 && N <= 72 && k >= 1 && k <= N)) return null;
    const base = desc.slice(0, m.index).replace(/[\s\-–:|]+$/, "").trim();
    return base ? { k, N, base } : null;
  }

  /* ---------- categorias ---------- */
  const CAT_RULES = {
    despesa: [
      ["Outros", "mercado livre, mercadolivre, shopee, magalu, magazine luiza, americanas, aliexpress, shein, casas bahia"],
      ["Moradia", "moradia, casa, aluguel, condominio, iptu, luz, energia, conta de luz, agua, gas, internet, telefone, celular, enel, cemig, sabesp, copel, light, comgas, net, claro, vivo, tim, oi, reforma, manutencao, faxina, diarista, moveis"],
      ["Alimentação", "alimentacao, mercado, supermercado, padaria, feira, acougue, restaurante, restaurantes, lanche, lanches, lanchonete, ifood, rappi, comida, delivery, hortifruti, atacadao, assai, carrefour, pao de acucar, almoco, jantar, cafe, pizza, hamburguer, mc donalds, mcdonalds, burger king"],
      ["Transporte", "transporte, uber, 99, taxi, combustivel, gasolina, etanol, alcool, diesel, posto, estacionamento, pedagio, onibus, metro, carro, veiculo, ipva, licenciamento, seguro auto, seguro do carro, mecanico, oficina, sem parar, moto"],
      ["Saúde", "saude, farmacia, drogaria, drogasil, raia, remedio, remedios, medico, consulta, exame, exames, plano de saude, unimed, amil, hapvida, sulamerica, dentista, hospital, academia, psicologo, terapia, otica"],
      ["Lazer", "lazer, cinema, show, viagem, viagens, hotel, bar, balada, passeio, jogo, jogos, games, steam, ingresso, festa, airbnb, parque, presente, presentes"],
      ["Educação", "educacao, escola, colegio, faculdade, universidade, curso, cursos, livro, livros, material escolar, mensalidade escolar, udemy, alura, ingles, idiomas"],
      ["Assinaturas", "assinatura, assinaturas, netflix, spotify, amazon prime, prime video, disney, hbo, max, youtube premium, apple, icloud, google one, globoplay, deezer, chatgpt, paramount, streaming"]
    ],
    receita: [
      ["Salário", "salario, salarios, pro labore, prolabore, holerite, 13o, decimo terceiro, ferias, adiantamento"],
      ["Freelance", "freela, freelance, servico, servicos, job, projeto, comissao, comissoes"],
      ["Rendimentos", "rendimento, rendimentos, dividendo, dividendos, juros, investimento, investimentos, cdb, tesouro, poupanca, aluguel recebido"]
    ]
  };
  const INCOME_HINT = /\b(salario|pro ?labore|holerite|freela|freelance|rendimento|dividendo|juros recebidos|reembolso|recebido|recebimento|pix recebido|transferencia recebida|deposito recebido|decimo terceiro|13o salario)\b/;
  const kwRe = {};
  const hasKw = (text, kw) => (kwRe[kw] = kwRe[kw] || new RegExp("(^|[^a-z0-9])" + kw.replace(/ /g, "\\s+") + "([^a-z0-9]|$)")).test(text);
  function guessCat(tipo, catText, desc) {
    const list = window.FinApp.CATS[tipo];
    const c = norm(catText);
    if (c) { const exact = list.find(x => norm(x) === c); if (exact) return exact; }
    for (const text of [c, norm(desc)]) {
      if (!text) continue;
      for (const [cat, words] of CAT_RULES[tipo]) {
        if (words.split(", ").some(k => hasKw(text, k))) return cat;
      }
    }
    return tipo === "receita" ? "Outras receitas" : "Outros";
  }

  /* ---------- cartões ---------- */
  const NOT_CARD = /\b(pix|dinheiro|especie|debito|boleto|transferencia|ted|doc|deposito|vale|va|vr|conta corrente|a vista|avista|cheque|carteira|cash)\b/;
  function cardName(raw) {
    if (raw == null || typeof raw === "object") return null;
    const n = norm(raw);
    if (!n || NOT_CARD.test(n) || toCents(raw) !== null) return null;
    let name = String(raw).replace(/cart[aã]o(\s+de)?/ig, "").replace(/cr[eé]dito/ig, "").replace(/\s{2,}/g, " ").trim().replace(/^[-–:,\/]+|[-–:,\/]+$/g, "").trim();
    if (!name) name = "Cartão de crédito";
    return name.slice(0, 30);
  }

  /* ---------- leitura do arquivo ---------- */
  async function readFile(file) {
    await loadLib();
    const buf = await file.arrayBuffer();
    const isText = /\.(csv|txt|tsv)$/i.test(file.name) || /^text\//.test(file.type);
    let wb;
    if (isText) {
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder("windows-1252").decode(buf); }
      text = text.replace(/^﻿/, "");
      const first = text.split(/\r?\n/, 1)[0] || "";
      const FS = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : (first.includes("\t") ? "\t" : ",");
      wb = XLSX.read(text, { type: "string", raw: true, FS });
    } else {
      wb = XLSX.read(buf, { type: "array", cellNF: true, cellDates: false });
    }
    return wb.SheetNames.map(name => ({ name, grid: grid(wb.Sheets[name]) }));
  }
  function grid(ws) {
    const out = [];
    if (!ws || !ws["!ref"]) return out;
    const r = XLSX.utils.decode_range(ws["!ref"]);
    const maxR = Math.min(r.e.r, r.s.r + 6000), maxC = Math.min(r.e.c, r.s.c + 40);
    for (let R = r.s.r; R <= maxR; R++) {
      const row = []; let any = false;
      for (let C = r.s.c; C <= maxC; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        let v = "";
        if (cell) {
          if (cell.t === "n") {
            const d = cell.z && XLSX.SSF.is_date(cell.z) ? serialToYmd(cell.v) : null;
            v = d ? { d } : cell.v;
          } else if (cell.t === "d" && cell.v instanceof Date) {
            const x = new Date(cell.v.getTime() + 12 * 3600e3);
            v = { d: x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()) };
          } else if (cell.t === "s" || cell.t === "str") v = String(cell.v).trim();
          else if (cell.t !== "b" && cell.t !== "e" && cell.t !== "z") v = String(cell.w || cell.v || "").trim();
        }
        if (v !== "") any = true;
        row.push(v);
      }
      out.push(any ? row : null);
    }
    return out;
  }

  /* ---------- entender cada aba ---------- */
  // mês e ano no nome da aba: "Janeiro", "Mar 2025", "03-2025", "2025-03", "Fev/24"
  function sheetMonth(name) {
    const s = norm(name);
    let m = s.match(/(\d{4})[-\/. _](\d{1,2})(?!\d)/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return { m: +m[2], y: +m[1] };
    m = s.match(/(?:^|[^\d])(\d{1,2})[-\/. _](\d{4})(?!\d)/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return { m: +m[1], y: +m[2] };
    m = s.match(MONTH_RE);
    if (m) {
      const y = s.slice(m.index + m[0].length).match(/^\s*(?:de\s*)?[\/\-_ ]?\s*(\d{4}|\d{2})(?!\d)/);
      return { m: monthIdx(m[2]), y: y ? (y[1].length === 2 ? 2000 + +y[1] : +y[1]) : null };
    }
    m = s.match(/(?:^|[^\d])(20\d{2})(?!\d)/);
    if (m) return { m: null, y: +m[1] }; // só o ano: "Orçamento 2025"
    return null;
  }
  // célula de cabeçalho que é um mês: "Jan", "Janeiro/25", data, "03/2025"
  function headerMonth(v) {
    if (v && v.d) return { m: +v.d.slice(5, 7), y: +v.d.slice(0, 4) };
    if (typeof v === "number") { const d = v > 20000 && v < 80000 ? serialToYmd(v) : null; return d ? { m: +d.slice(5, 7), y: +d.slice(0, 4) } : null; }
    const s = norm(v);
    if (!s || s.length > 16) return null;
    let m = s.match(/^(\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return { m: +m[1], y: m[2].length === 2 ? 2000 + +m[2] : +m[2] };
    m = s.match(/^([a-z]{3,9})\.?\s*(?:de\s*)?[\/\-_ ]?\s*(\d{2}|\d{4})?$/);
    if (m && monthIdx(m[1])) return { m: monthIdx(m[1]), y: m[2] ? (m[2].length === 2 ? 2000 + +m[2] : +m[2]) : null };
    return null;
  }

  function analyze(sheet) {
    const g = sheet.grid;
    sheet.month = sheetMonth(sheet.name);
    let best = null;
    for (let R = 0; R < Math.min(g.length, 30); R++) {
      const row = g[R]; if (!row) continue;
      const map = autoMap(row);
      const roles = Object.keys(map).length;
      const months = row.map((v, c) => ({ c, hm: headerMonth(v) })).filter(x => x.hm);
      const hasVal = map.valor !== undefined || map.entrada !== undefined || map.saida !== undefined;
      if (months.length >= 3 && (!best || months.length * 2 > best.score)) best = { R, mode: "matriz", score: months.length * 2, months, map };
      else if (hasVal && roles >= 2 && (!best || roles > best.score)) best = { R, mode: "lista", score: roles, map };
    }
    const width = g.reduce((w, r) => Math.max(w, r ? r.length : 0), 0);
    if (!best) {
      sheet.mode = "lista"; sheet.headerRow = -1; sheet.map = {};
      sheet.headers = Array.from({ length: width }, (_, i) => "Coluna " + XLSX.utils.encode_col(i));
    } else {
      sheet.mode = best.mode; sheet.headerRow = best.R; sheet.map = best.map;
      const hr = g[best.R];
      sheet.headers = Array.from({ length: width }, (_, i) => {
        const v = hr[i]; const t = v && v.d ? v.d.split("-").reverse().join("/") : String(v == null ? "" : v).trim();
        return t ? t.slice(0, 28) : "Coluna " + XLSX.utils.encode_col(i);
      });
      if (best.mode === "matriz") {
        sheet.monthCols = best.months;
        const firstM = Math.min(...best.months.map(x => x.c));
        if (sheet.map.descricao === undefined || sheet.map.descricao > firstM) {
          // a primeira coluna com texto, antes dos meses, é a descrição
          const counts = []; for (let c = 0; c < firstM; c++) counts[c] = 0;
          g.slice(best.R + 1).forEach(r => r && r.slice(0, firstM).forEach((v, c) => { if (isText(v)) counts[c]++; }));
          const pick = counts.reduce((bi, n, c) => (n > (counts[bi] || 0) && c !== sheet.map.categoria ? c : bi), 0);
          sheet.map.descricao = pick;
        }
      }
    }
    sheet.selected = null;
  }

  /* ---------- transformar linhas em lançamentos ---------- */
  function extract(sheet, opts) {
    const g = sheet.grid, map = sheet.map, out = [], ctx0 = { year: opts.year };
    let ignored = 0;
    const ctxYm = sheet.month && sheet.month.m ? (sheet.month.y || opts.year) + "-" + pad(sheet.month.m) : null;
    if (sheet.month && !sheet.month.m) ctx0.year = sheet.month.y;
    const ctx = ctx0; ctx.ym = ctxYm;
    const cell = (row, k) => map[k] === undefined ? "" : row[map[k]];
    let section = null, lastDate = null;

    if (sheet.mode === "matriz") {
      let y0 = sheet.month && sheet.month.y ? sheet.month.y : opts.year, prevM = 0;
      const cols = sheet.monthCols.slice().sort((a, b) => a.c - b.c).map(x => {
        let y = x.hm.y;
        if (!y) { if (prevM && x.hm.m < prevM) y0++; y = y0; } else y0 = y;
        prevM = x.hm.m;
        return { c: x.c, ym: y + "-" + pad(x.hm.m) };
      });
      for (let R = sheet.headerRow + 1; R < g.length; R++) {
        const row = g[R]; if (!row) continue;
        const desc = String(cell(row, "descricao") || "").trim();
        const nd = norm(desc);
        const vals = cols.map(x => ({ ym: x.ym, v: toCents(row[x.c]) })).filter(x => x.v);
        if (!vals.length || SEC_ONLY.test(nd)) { if (SEC_IN.test(nd)) section = "receita"; else if (SEC_OUT.test(nd)) section = "despesa"; continue; }
        if (!desc || SKIP_RE.test(nd)) { ignored += vals.length; continue; }
        const dia = parseInt(cell(row, "data"), 10);
        for (const x of vals) {
          out.push(row2tx({ desc, v: x.v, date: clampDay(x.ym, dia >= 1 && dia <= 31 ? dia : 1), tipoTxt: cell(row, "tipo"), section, catTxt: cell(row, "categoria"), cardTxt: cell(row, "cartao"), parcTxt: "", sheet: sheet.name }));
        }
      }
      return { rows: out, ignored };
    }

    if (map.valor === undefined && map.entrada === undefined && map.saida === undefined) return { rows: out, ignored: 0, noValue: true };
    // se a aba tem valores negativos e positivos, o sinal diz o que é saída e o que é entrada
    let neg = 0, pos = 0;
    if (map.valor !== undefined) for (let R = sheet.headerRow + 1; R < g.length; R++) { const row = g[R]; if (!row) continue; const v = toCents(cell(row, "valor")); if (v < 0) neg++; else if (v > 0) pos++; }
    const mixedSigns = neg > 0 && pos > 0;
    for (let R = sheet.headerRow + 1; R < g.length; R++) {
      const row = g[R]; if (!row) continue;
      let desc = String(cell(row, "descricao") || "").trim();
      if (desc && typeof cell(row, "descricao") === "object") desc = "";
      let v = null, forced = null;
      if (map.entrada !== undefined || map.saida !== undefined) {
        const a = toCents(cell(row, "entrada")), b = toCents(cell(row, "saida"));
        if (a) { v = Math.abs(a); forced = "receita"; } else if (b) { v = Math.abs(b); forced = "despesa"; }
      }
      if (v === null && map.valor !== undefined) v = toCents(cell(row, "valor"));
      const nd = norm(desc);
      if (desc && SEC_ONLY.test(nd) && map.data !== undefined && !parseDate(cell(row, "data"), ctx)) { section = SEC_IN.test(nd) ? "receita" : "despesa"; continue; }
      if (!v) {
        if (desc && SEC_IN.test(nd)) section = "receita"; else if (desc && SEC_OUT.test(nd)) section = "despesa";
        else if (row.some(x => x !== "")) ignored++;
        continue;
      }
      if (SKIP_RE.test(nd) || (!desc && map.descricao !== undefined && !cell(row, "categoria"))) { ignored++; continue; }
      let date = map.data !== undefined ? parseDate(cell(row, "data"), ctx) : null;
      if (!date) date = lastDate || (ctxYm ? ctxYm + "-01" : null);
      if (!date) { ignored++; continue; }
      lastDate = date;
      out.push(row2tx({ desc: desc || String(cell(row, "categoria") || "Sem descrição"), v, forced, date, tipoTxt: cell(row, "tipo"), section, catTxt: cell(row, "categoria"), cardTxt: cell(row, "cartao"), parcTxt: cell(row, "parcela"), mixedSigns, sheet: sheet.name }));
    }
    return { rows: out, ignored };
  }
  function row2tx(r) {
    let tipo = r.forced;
    const t = norm(r.tipoTxt);
    if (!tipo && t) {
      if (/^\+|receita|entrada|recebid|ganho|renda|credito em conta|^c$|^e$/.test(t)) tipo = "receita";
      else if (/^-|despesa|saida|debito|gasto|pagamento|pago|compra|^d$|^s$/.test(t)) tipo = "despesa";
    }
    if (!tipo && r.v < 0) tipo = "despesa";
    if (!tipo && r.section) tipo = r.section;
    if (!tipo && r.v > 0 && r.mixedSigns) tipo = "receita";
    // coluna "Tipo" que traz a categoria (Alimentação, Moradia…) em vez de receita/despesa
    if (!r.catTxt && t && !/receita|entrada|despesa|saida|debito|credito|gasto/.test(t)) r.catTxt = r.tipoTxt;
    if (!tipo) tipo = INCOME_HINT.test(norm(r.desc) + " " + norm(r.catTxt)) || /^(salario|receitas?|entradas?|renda)$/.test(norm(r.catTxt)) ? "receita" : "despesa";
    let desc = r.desc.replace(/\s+/g, " ").slice(0, 80), parc = parseParcela(r.parcTxt);
    if (!parc) { const s = splitDescParcela(desc); if (s) { parc = { k: s.k, N: s.N }; desc = s.base; } }
    else { const s = splitDescParcela(desc); if (s) desc = s.base; }
    return {
      tipo, descricao: desc, valor: Math.abs(r.v), sign: Math.sign(r.v), data: r.date,
      categoria: guessCat(tipo, r.catTxt, desc), cardRaw: tipo === "despesa" ? cardName(r.cardTxt) : null,
      parc: tipo === "despesa" ? parc : null, sheet: r.sheet
    };
  }

  /* ---------- montar o que será gravado ---------- */
  function compute() {
    const st = window.FinApp.state, opts = { year: S.year };
    let rows = [], ignored = 0;
    S.sheets.forEach(sh => {
      const res = extract(sh, opts);
      sh.count = res.rows.length; sh.noValue = !!res.noValue;
      if (sh.selected === null) sh.selected = res.rows.length > 0 && !/^(resumo|dashboard|painel|grafico|graficos|total|totais|instru|config|categorias|listas?)\b/.test(norm(sh.name));
      if (sh.selected) { rows = rows.concat(res.rows); ignored += res.ignored; }
    });

    // cartões
    const known = st.cards.map(c => ({ id: c.id, nome: c.nome, n: norm(c.nome) }));
    const fresh = new Map();
    const resolveCard = name => {
      if (!name) return null;
      const n = norm(name);
      const hit = known.find(c => c.n === n) || known.find(c => n.length >= 3 && c.n.length >= 3 && (c.n.includes(n) || n.includes(c.n)));
      if (hit) return hit.id;
      if (!fresh.has(n)) {
        const d = S.cardDays[n] || (S.cardDays[n] = { f: 1, v: 10 });
        fresh.set(n, { id: S.cardIds[n] || (S.cardIds[n] = window.FinDB.newId()), nome: name, n, days: d, uses: 0 });
      }
      fresh.get(n).uses++;
      return fresh.get(n).id;
    };

    const seenTx = new Set(st.real.map(t => [t.data, t.valorCentavos, t.tipo, norm(t.descricao)].join("|")));
    const planKey = (desc, N, v, startYm) => [norm(desc), N, v, startYm].join("|");
    const seenPlan = new Set(st.plans.filter(p => p.parcelas).map(p => planKey(p.descricao, p.parcelas, p.valorCentavos, shiftMonth(p.inicio.slice(0, 7), -((p.primeira || 1) - 1)))));
    const lanc = [], groups = new Map();
    let dups = 0;
    for (const r of rows) {
      const cartao = resolveCard(r.cardRaw);
      if (r.parc) {
        const per = S.totalMode ? Math.round(r.valor / r.parc.N) : r.valor;
        const startYm = shiftMonth(r.data.slice(0, 7), -(r.parc.k - 1));
        const key = planKey(r.descricao, r.parc.N, per, startYm) + "|" + (cartao || "");
        const g = groups.get(key);
        if (!g) groups.set(key, { r, per, cartao, startYm, k: r.parc.k, n: 1 });
        else { g.n++; if (r.parc.k < g.k) { g.k = r.parc.k; g.r = r; } }
        continue;
      }
      const fp = [r.data, r.valor, r.tipo, norm(r.descricao)].join("|");
      if (seenTx.has(fp)) { dups++; continue; }
      lanc.push({ tipo: r.tipo, descricao: r.descricao, valorCentavos: r.valor, data: r.data, categoria: r.categoria, cartao: r.tipo === "despesa" ? cartao : null, sheet: r.sheet });
    }
    const planos = [];
    groups.forEach(g => {
      const N = g.r.parc.N;
      if (seenPlan.has(planKey(g.r.descricao, N, g.per, g.startYm))) { dups += g.n; return; }
      planos.push({
        forma: "parcelada", descricao: g.r.descricao, categoria: g.r.categoria, valorCentavos: g.per,
        totalCentavos: S.totalMode ? g.r.valor : null, parcelas: N, primeira: g.k, inicio: g.r.data, cartao: g.cartao, linhas: g.n
      });
    });
    // cartões novos que acabaram sem uso (todas as linhas eram repetidas) não são criados
    const usedCards = new Set(lanc.map(t => t.cartao).concat(planos.map(p => p.cartao)).filter(Boolean));
    const newCards = [...fresh.values()].filter(c => usedCards.has(c.id));
    const months = lanc.map(t => t.data.slice(0, 7)).concat(planos.map(p => p.inicio.slice(0, 7))).sort();
    const anyParc = rows.some(r => r.parc);
    S.result = { lanc, planos, newCards, dups, ignored, months, anyParc, total: rows.length };
    return S.result;
  }

  /* ---------- telas ---------- */
  let S = null, unsubHist = null, lastFocus = null;
  const ACCEPT = ".xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.txt,.ods,.numbers,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";
  const ICON_X = '<svg class="ico" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const ICON_UP = '<svg class="ico" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';
  const head = (t, back) => '<div class="modal-head">' + (back ? '<button class="round" type="button" id="impBack" aria-label="Voltar"><svg class="ico" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' : "") + '<h2 style="flex:1;margin-left:' + (back ? "10px" : "0") + '">' + t + '</h2><button class="round" type="button" id="impClose" aria-label="Fechar">' + ICON_X + "</button></div>";
  function ov() {
    let o = $("importOv");
    if (!o) {
      o = document.createElement("div"); o.id = "importOv"; o.className = "overlay imp"; o.setAttribute("aria-hidden", "true");
      o.addEventListener("click", e => { if (e.target === o) closeOv(); });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && o.classList.contains("open")) closeOv(); });
      document.body.append(o);
    }
    return o;
  }
  function paint(inner) {
    const o = ov();
    o.innerHTML = '<div class="modal glass imp-modal" role="dialog" aria-modal="true" aria-label="Importar planilha"><div class="imp-body">' + inner + "</div></div>";
    if (!o.classList.contains("open")) { void o.offsetWidth; o.classList.add("open"); o.setAttribute("aria-hidden", "false"); }
    const c = $("impClose"); if (c) c.addEventListener("click", closeOv);
    const b = $("impBack"); if (b) b.addEventListener("click", () => openStart());
    return o;
  }
  function closeOv() {
    const o = $("importOv"); if (!o) return;
    o.classList.remove("open"); o.setAttribute("aria-hidden", "true");
    if (unsubHist) { unsubHist(); unsubHist = null; }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function say(text, bad) { const m = $("impMsg"); if (m) { m.className = "msg" + (bad ? " err" : ""); m.textContent = text; } }

  function open() {
    lastFocus = document.activeElement;
    openStart();
  }
  function openStart() {
    paint(head("Importar planilha") +
      '<p class="hint">Envie a planilha em que você já controla suas finanças: Excel (.xlsx ou .xls), Numbers, Google Planilhas (baixada como .xlsx) ou .csv.</p>' +
      '<ul class="imp-list"><li>Reconhece colunas de <b>data</b>, <b>descrição</b>, <b>valor</b>, <b>categoria</b>, <b>cartão</b> e <b>parcela</b> (como 3/10).</li>' +
      '<li>Aceita uma aba por mês (Janeiro, Fevereiro…) e planilhas com os meses lado a lado.</li>' +
      '<li>Compras parceladas viram parcelamentos e continuam aparecendo nos próximos meses.</li>' +
      '<li>Você confere tudo antes de salvar, e pode desfazer depois.</li></ul>' +
      '<label class="btn btn-accent imp-pick" for="impFile">' + ICON_UP + 'Escolher planilha<input id="impFile" type="file" accept="' + ACCEPT + '" hidden></label>' +
      '<p class="msg" id="impMsg" role="status"></p><div id="impHist"></div>');
    $("impFile").addEventListener("change", onFile);
    if (unsubHist) unsubHist();
    window.FinDB.ready().then(db => {
      unsubHist = db.collection("importacoes").onSnapshot(snap => paintHist(snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""))));
    });
  }
  async function onFile(e) {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      e.target.value = "";
      if (f.size > 15 * 1024 * 1024) return say("Arquivo muito grande. Envie uma planilha com até 15 MB.", true);
      say(window.XLSX ? "Lendo a planilha…" : "Preparando o leitor de planilhas…");
      try {
        const sheets = await readFile(f);
        sheets.forEach(analyze);
        const useful = sheets.filter(s => s.grid.some(Boolean));
        if (!useful.length) return say("Essa planilha está vazia.", true);
        S = { file: f.name, sheets: useful, year: thisYear, totalMode: false, cardDays: {}, cardIds: {}, result: null };
        openReview();
      } catch (err) {
        console.error(err);
        say(err && err.message === "lib" ? "Sem internet para abrir o leitor de planilhas. Conecte-se e tente de novo." : "Não consegui ler esse arquivo. Se for do Numbers ou Google Planilhas, exporte como Excel (.xlsx) e tente de novo.", true);
      }
  }
  function paintHist(list) {
    const box = $("impHist"); if (!box) return;
    if (!list.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<p class="imp-title">Importações anteriores</p><div class="imp-hist"></div>';
    const wrap = box.querySelector(".imp-hist");
    list.slice(0, 8).forEach(h => {
      const el = document.createElement("div"); el.className = "imp-h";
      const when = new Date(h.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
      const parts = [h.lancamentos ? h.lancamentos + " lançamentos" : "", h.planos ? h.planos + " parcelamentos" : "", h.cartoes ? h.cartoes + " cartões" : ""].filter(Boolean).join(" · ");
      el.innerHTML = "<div><b>" + esc(h.arquivo) + "</b><small>" + esc(when + (parts ? " · " + parts : "")) + '</small></div><button class="btn btn-glass mini" type="button">Desfazer</button>';
      const b = el.querySelector("button");
      b.addEventListener("click", async () => {
        if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Apagar tudo dela?"; setTimeout(() => { b.classList.remove("armed"); b.textContent = "Desfazer"; }, 4000); return; }
        b.disabled = true; b.textContent = "Desfazendo…";
        try { const n = await undo(h.id); window.FinApp.toast("Importação desfeita: " + n + " registros apagados"); }
        catch (e) { say("Não deu para desfazer agora. Verifique a internet.", true); b.disabled = false; b.textContent = "Desfazer"; b.classList.remove("armed"); }
      });
      wrap.append(el);
    });
  }
  async function undo(id) {
    const st = window.FinApp.state;
    const del = [];
    st.real.filter(t => t.importacao === id).forEach(t => del.push({ col: "lancamentos", id: t.id }));
    st.plans.filter(p => p.importacao === id).forEach(p => del.push({ col: "planos", id: p.id }));
    const gone = new Set(del.map(d => d.id));
    st.cards.filter(c => c.importacao === id).forEach(c => {
      const still = st.real.some(t => t.cartao === c.id && !gone.has(t.id)) || st.plans.some(p => p.cartao === c.id && !gone.has(p.id));
      if (!still) del.push({ col: "cartoes", id: c.id });
    });
    del.push({ col: "importacoes", id });
    await window.FinDB.bulk([], del);
    return del.length - 1;
  }

  function openReview() {
    const yearless = S.sheets.some(s => !(s.month && s.month.y) && (s.month || (s.mode === "matriz" && s.monthCols.some(x => !x.hm.y))));
    paint(head("Conferir importação", true) +
      '<p class="hint imp-file"></p>' +
      '<p class="imp-title">Abas da planilha</p><div class="imp-sheets" id="impSheets"></div>' +
      '<div class="two" id="impOpts">' +
      (yearless ? '<div class="field"><label for="impYear">Ano das abas sem ano</label><input id="impYear" type="number" inputmode="numeric" min="2000" max="2100" value="' + S.year + '"></div>' : "") +
      "</div>" +
      '<div id="impParc"></div>' +
      '<div class="imp-sum" id="impSum"></div>' +
      '<div id="impCards"></div>' +
      '<div id="impPrevBox"></div>' +
      '<div class="imp-actions"><button class="btn btn-accent" id="impGo" type="button" style="padding:13px">Importar</button>' +
      '<label class="btn btn-glass" for="impFile2">Escolher outro arquivo<input id="impFile2" type="file" accept="' + ACCEPT + '" hidden></label></div>' +
      '<p class="msg" id="impMsg" role="status"></p>');
    document.querySelector(".imp-file").textContent = S.file;
    $("impFile2").addEventListener("change", onFile);
    if (yearless) $("impYear").addEventListener("change", e => { const y = parseInt(e.target.value, 10); if (y >= 2000 && y <= 2100) { S.year = y; refresh(); } });
    $("impGo").addEventListener("click", save);
    paintSheets();
    refresh();
  }
  function paintSheets() {
    const box = $("impSheets"); box.textContent = "";
    compute();
    S.sheets.forEach((sh, i) => {
      const el = document.createElement("div"); el.className = "imp-sheet";
      const id = "impS" + i;
      el.innerHTML = '<label class="imp-check" for="' + id + '"><input type="checkbox" id="' + id + '"><b></b><span></span></label>' +
        '<details><summary>Ajustar colunas</summary><div class="imp-map"></div></details>';
      el.querySelector("b").textContent = sh.name;
      const cb = el.querySelector("input"); cb.checked = !!sh.selected;
      cb.addEventListener("change", () => { sh.selected = cb.checked; refresh(); });
      const mapBox = el.querySelector(".imp-map");
      const roles = sh.mode === "matriz" ? ROLES.filter(r => ["descricao", "categoria", "tipo", "cartao", "data"].includes(r[0])) : ROLES;
      roles.forEach(([k, label]) => {
        const f = document.createElement("div"); f.className = "field";
        const sid = id + "_" + k;
        f.innerHTML = '<label for="' + sid + '">' + (sh.mode === "matriz" && k === "data" ? "Dia do mês" : label) + '</label><select id="' + sid + '"><option value="">—</option>' +
          sh.headers.map((h, c) => '<option value="' + c + '"' + (sh.map[k] === c ? " selected" : "") + ">" + esc(h) + "</option>").join("") + "</select>";
        f.querySelector("select").addEventListener("change", e => {
          const v = e.target.value === "" ? undefined : Number(e.target.value);
          // uma coluna só pode ter um papel
          if (v !== undefined) ROLE_KEYS.forEach(o => { if (o !== k && sh.map[o] === v) { delete sh.map[o]; const s2 = $(id + "_" + o); if (s2) s2.value = ""; } });
          if (v === undefined) delete sh.map[k]; else sh.map[k] = v;
          if (sh.headerRow < 0 && v !== undefined) sh.headerRow = firstDataRow(sh);
          if (!sh.selected) { sh.selected = true; cb.checked = true; }
          refresh();
        });
        mapBox.append(f);
      });
      if (sh.mode === "matriz") {
        const p = document.createElement("p"); p.className = "hint"; p.style.gridColumn = "1 / -1";
        p.textContent = "Meses lado a lado: cada valor vira um lançamento no mês da coluna.";
        mapBox.prepend(p);
      }
      box.append(el);
    });
  }
  // sem cabeçalho: os dados começam na primeira linha preenchida
  function firstDataRow(sh) { const i = sh.grid.findIndex(Boolean); return i < 0 ? 0 : i - 1; }

  function refresh() {
    const r = compute();
    S.sheets.forEach((sh, i) => {
      const span = document.querySelector('label[for="impS' + i + '"] span'); if (!span) return;
      const mo = sh.month && sh.month.m ? fmtYm((sh.month.y || S.year) + "-" + pad(sh.month.m)) + " · " : "";
      span.textContent = sh.noValue ? (sh.selected ? "não achei a coluna de valor" : "sem lançamentos") : mo + sh.count + (sh.count === 1 ? " linha" : " linhas") + (sh.mode === "matriz" ? " · meses lado a lado" : "");
      span.classList.toggle("warn", !!sh.selected && (!!sh.noValue || !sh.count));
      const det = span.closest(".imp-sheet").querySelector("details");
      if (sh.noValue && sh.selected && !det.open) det.open = true;
    });
    // parcelas: valor da parcela ou total
    const pb = $("impParc");
    if (r.anyParc) {
      if (!pb.dataset.on) {
        pb.dataset.on = "1";
        pb.innerHTML = '<div class="field"><label>Nas compras parceladas, o valor da planilha é</label><div class="seg seg-full" role="group"><button type="button" data-tm="0">Da parcela</button><button type="button" data-tm="1">O total da compra</button></div></div>';
        pb.querySelectorAll("[data-tm]").forEach(b => b.addEventListener("click", () => { S.totalMode = b.dataset.tm === "1"; refresh(); }));
      }
      pb.querySelectorAll("[data-tm]").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.tm === "1") === S.totalMode)));
    } else { pb.textContent = ""; delete pb.dataset.on; }

    const inc = r.lanc.filter(t => t.tipo === "receita"), out = r.lanc.filter(t => t.tipo === "despesa");
    const sum = a => a.reduce((s, t) => s + t.valorCentavos, 0);
    const period = r.months.length ? (r.months[0] === r.months[r.months.length - 1] ? fmtYm(r.months[0]) : fmtYm(r.months[0]) + " a " + fmtYm(r.months[r.months.length - 1])) : "—";
    const tile = (b, s, cls) => '<div class="imp-tile' + (cls ? " " + cls : "") + '"><b>' + b + "</b><span>" + s + "</span></div>";
    $("impSum").innerHTML =
      tile(inc.length, "receitas · " + esc(money(sum(inc))), "in") +
      tile(out.length, "despesas · " + esc(money(sum(out))), "out") +
      tile(r.planos.length, r.planos.length === 1 ? "compra parcelada" : "compras parceladas") +
      tile(esc(period), "período", "wide") +
      (r.dups ? tile(r.dups, "já estavam no app e serão puladas", "muted") : "") +
      (r.ignored ? tile(r.ignored, "linhas sem valor, totais ou sem data", "muted") : "");

    const cb = $("impCards");
    if (r.newCards.length) {
      cb.innerHTML = '<div class="imp-cards"><p class="imp-title" style="margin:0">Cartões novos</p><p class="hint">Confira o dia de fechamento e de vencimento de cada um. Eles definem em qual fatura cada compra entra.</p>' +
        '<div class="imp-card imp-card-h"><span></span><span>Fecha dia</span><span>Vence dia</span></div></div>';
      const box = cb.firstChild;
      r.newCards.forEach(c => {
        const row = document.createElement("div"); row.className = "imp-card";
        row.innerHTML = '<b></b><input type="number" inputmode="numeric" min="1" max="31" aria-label="Dia do fechamento"><input type="number" inputmode="numeric" min="1" max="31" aria-label="Dia do vencimento">';
        row.querySelector("b").textContent = c.nome + " (" + c.uses + ")";
        const [fi, vi] = row.querySelectorAll("input");
        fi.value = c.days.f; vi.value = c.days.v;
        fi.addEventListener("change", () => { const n = parseInt(fi.value, 10); if (n >= 1 && n <= 31) c.days.f = n; else fi.value = c.days.f; });
        vi.addEventListener("change", () => { const n = parseInt(vi.value, 10); if (n >= 1 && n <= 31) c.days.v = n; else vi.value = c.days.v; });
        box.append(row);
      });
    } else cb.textContent = "";

    const pv = $("impPrevBox");
    const sample = r.planos.map(p => Object.assign({ isPlan: true }, p)).slice(0, 3).concat(r.lanc.slice().sort((a, b) => b.data.localeCompare(a.data)).slice(0, 7));
    const cardName2 = id => { if (!id) return ""; const c = window.FinApp.state.cards.find(x => x.id === id) || r.newCards.find(x => x.id === id); return c ? " · " + c.nome : ""; };
    pv.innerHTML = sample.length ? '<p class="imp-title">Prévia</p><div class="imp-prev">' + sample.map(t => {
      const d = t.isPlan ? t.primeira + "/" + t.parcelas : t.data.slice(8, 10) + "/" + t.data.slice(5, 7) + "/" + t.data.slice(2, 4);
      const sub = t.isPlan ? "Parcelado a partir de " + fmtYm(t.inicio.slice(0, 7)) + " · " + t.categoria + cardName2(t.cartao) : t.categoria + cardName2(t.cartao);
      return '<div class="imp-row"><span class="d">' + esc(d) + '</span><span class="t">' + esc(t.descricao) + "<small>" + esc(sub) + '</small></span><span class="v' + (t.tipo === "receita" ? " in" : "") + '">' + (t.tipo === "receita" ? "+" : "−") + esc(money(t.valorCentavos)) + "</span></div>";
    }).join("") + "</div>" : "";

    const n = r.lanc.length + r.planos.length;
    const go = $("impGo");
    go.disabled = !n;
    go.textContent = n ? "Importar " + n + (n === 1 ? " registro" : " registros") + (r.newCards.length ? " e " + r.newCards.length + (r.newCards.length === 1 ? " cartão" : " cartões") : "") : "Nada para importar";
    if (!n) say(S.sheets.some(s => s.selected) ? "Não encontrei lançamentos. Toque em “Ajustar colunas” e indique onde estão a data, a descrição e o valor." : "Marque pelo menos uma aba.", !!S.sheets.some(s => s.selected));
    else say("");
  }

  async function save() {
    const r = S.result; if (!r) return;
    const go = $("impGo"); go.disabled = true; go.textContent = "Importando…"; say("");
    const now = new Date().toISOString(), importacao = window.FinDB.newId();
    const colors = Object.keys(window.FinApp.CARD_COLORS);
    const used = window.FinApp.state.cards.length;
    // o registro da importação vai primeiro: se algo falhar no meio, dá para desfazer o que entrou
    const writes = [{ col: "importacoes", id: importacao, data: { arquivo: S.file, criadoEm: now, lancamentos: r.lanc.length, planos: r.planos.length, cartoes: r.newCards.length } }];
    r.newCards.forEach((c, i) => writes.push({ col: "cartoes", id: c.id, data: { nome: c.nome, cor: colors[(used + i) % colors.length], fechamento: c.days.f, vencimento: c.days.v, limite: null, criadoEm: now, importacao } }));
    r.planos.forEach(p => writes.push({ col: "planos", data: { forma: p.forma, descricao: p.descricao, categoria: p.categoria, valorCentavos: p.valorCentavos, totalCentavos: p.totalCentavos, parcelas: p.parcelas, primeira: p.primeira, inicio: p.inicio, cartao: p.cartao || null, criadoEm: now, importacao } }));
    r.lanc.forEach(t => writes.push({ col: "lancamentos", data: { tipo: t.tipo, descricao: t.descricao, valorCentavos: t.valorCentavos, data: t.data, categoria: t.categoria, cartao: t.cartao || null, criadoEm: now, importacao } }));
    try {
      await window.FinDB.bulk(writes, []);
      const last = r.months[r.months.length - 1];
      closeOv();
      window.FinApp.toast("Planilha importada: " + (r.lanc.length + r.planos.length) + " registros" + (r.newCards.length ? " e " + r.newCards.length + " cartões" : ""));
      if (last) window.FinApp.goMonth(last);
      S.cardIds = {};
    } catch (e) {
      console.error(e);
      go.disabled = false; refresh();
      say(navigator.onLine ? "Não deu para salvar tudo agora. Se parte entrou, desfaça em Importações anteriores e tente de novo." : "Sem internet. Conecte-se para importar.", true);
    }
  }

  window.FinImport = { open, _test: { parseDate, toCents, parseParcela, splitDescParcela, sheetMonth, headerMonth, guessCat, cardName, autoMap } };
})();
