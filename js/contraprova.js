/**
 * ============================================================
 *  CONTRAPROVA.JS — Estoque de testes descartáveis (portal ADM)
 * ============================================================
 *  Aba CONTRAPROVA ESTOQUE no Sheets (só registra ALOCAÇÕES,
 *  nunca precisa ser "editada" depois — sempre soma):
 *  A Garagem | B Empresa | C Quantidade Alocada | D Data | E Registrado por
 *
 *  O "uso" não tem aba própria — é contado direto nas abas
 *  BASE SAO/RIO/SUL, procurando linhas com Tentativa = "CP"
 *  (coluna J) pra cada garagem. Isso evita duplicar controle:
 *  a mesma linha que já registra o teste em si também conta
 *  como consumo de estoque.
 * ============================================================
 */

const $ = (id) => document.getElementById(id);
let GARAGENS_CP = [];

function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("visible");
  setTimeout(() => t.classList.remove("visible"), 3000);
}

function getPerfil() {
  const raw = sessionStorage.getItem("baf_perfil");
  return raw ? JSON.parse(raw) : null;
}

async function carregarGaragensParaContraprova() {
  const perfil = getPerfil();
  if (!perfil) return;

  const rows = await Sheets.getValues(`${APP_CONFIG.sheets.recepcaoAtiva}!A2:B`);
  GARAGENS_CP = rows
    .map(r => ({ empresa: r[0] || "", garagem: r[1] || "" }))
    .filter(g => g.garagem && g.empresa === perfil.empresa);

  const select = $("cpGaragem");
  select.innerHTML = '<option value="">Selecione a garagem…</option>';
  GARAGENS_CP.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.garagem;
    opt.textContent = g.garagem;
    select.appendChild(opt);
  });
}

/** Conta quantos testes "CP" já foram usados por garagem, olhando
 *  as 3 abas BASE (coluna D = Contrato/Local, coluna J = Tentativa) */
async function contarUsoPorGaragem() {
  const nomesBases = [APP_CONFIG.bases.SAO, APP_CONFIG.bases.RIO, APP_CONFIG.bases.SUL];
  const resultados = await Promise.all(
    nomesBases.map(nome => Sheets.getValues(`${nome}!A2:J`).catch(() => []))
  );

  const uso = {}; // { "Garagem X": contagem }
  resultados.forEach(rows => {
    rows.forEach(r => {
      const local = r[3] || "";
      const tentativa = r[9] || "";
      if (tentativa === "CP" && local) {
        uso[local] = (uso[local] || 0) + 1;
      }
    });
  });
  return uso;
}

async function carregarEstoqueContraprova() {
  const perfil = getPerfil();
  if (!perfil) return;

  const [rows, uso] = await Promise.all([
    Sheets.getValues(`${APP_CONFIG.sheets.contraprovaEstoque}!A2:E`),
    contarUsoPorGaragem()
  ]);

  const alocadoPorGaragem = {};
  rows.forEach(r => {
    const garagem = r[0] || "";
    const empresa = r[1] || "";
    const quantidade = parseInt(r[2], 10) || 0;
    if (empresa === perfil.empresa && garagem) {
      alocadoPorGaragem[garagem] = (alocadoPorGaragem[garagem] || 0) + quantidade;
    }
  });

  const list = $("listaEstoqueContraprova");
  list.innerHTML = "";

  const garagensComEstoque = GARAGENS_CP.filter(g => alocadoPorGaragem[g.garagem] > 0);

  if (!garagensComEstoque.length) {
    list.innerHTML = '<div class="empty-state">Nenhum teste de contraprova alocado ainda.</div>';
    return;
  }

  garagensComEstoque.forEach(g => {
    const alocado = alocadoPorGaragem[g.garagem] || 0;
    const usado = uso[g.garagem] || 0;
    const disponivel = alocado - usado;
    const pillClass = disponivel <= 0 ? "error" : disponivel <= 2 ? "warn" : "ok";

    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div>
        <div>${g.garagem}</div>
        <div class="muted mono">Usado ${usado}/${alocado}</div>
      </div>
      <span class="pill ${pillClass}">${disponivel} disponível${disponivel === 1 ? "" : "eis"}</span>`;
    list.appendChild(row);
  });
}

async function alocarContraprova(ev) {
  ev.preventDefault();
  const perfil = getPerfil();
  if (!perfil) return;

  const garagem = $("cpGaragem").value;
  const quantidade = parseInt($("cpQuantidade").value, 10);
  if (!garagem || !quantidade || quantidade < 1) return;

  const btn = $("btnAlocarContraprova");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    await Sheets.appendRow(APP_CONFIG.sheets.contraprovaEstoque, [
      garagem, perfil.empresa, quantidade, new Date().toISOString().slice(0, 10), perfil.nome
    ]);
    toast(`${quantidade} teste(s) alocado(s) para ${garagem}.`);
    $("formContraprova").reset();
    await carregarEstoqueContraprova();
  } catch (e) {
    if (window.Sheets && Sheets.tratarErroSessao(e)) return;
    toast("Erro ao alocar testes: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Alocar Testes";
  }
}

async function initContraprova() {
  if (!document.getElementById("formContraprova")) return; // painel só existe no portal ADM
  await carregarGaragensParaContraprova();
  await carregarEstoqueContraprova();
  $("formContraprova").addEventListener("submit", alocarContraprova);
}

initContraprova();
