/**
 * ============================================================
 *  CONTRAPROVA.JS — Estoque de testes descartáveis (portal ADM)
 * ============================================================
 *  Aba CONTRAPROVA ESTOQUE no Sheets (só registra ALOCAÇÕES,
 *  nunca precisa ser "editada" depois — sempre soma):
 *  A Garagem (vazio = Estoque Geral) | B Empresa | C Quantidade
 *  D Data | E Registrado por
 *
 *  Transferir do estoque geral pra uma garagem = duas linhas novas:
 *  uma negativa em branco (saída do geral) e uma positiva na
 *  garagem de destino (entrada) — mantém o histórico sempre por
 *  soma, sem precisar editar linha nenhuma.
 *
 *  O "uso" não tem aba própria — é contado direto nas abas
 *  BASE SAO/RIO/SUL, procurando linhas com Tentativa = "CP"
 *  pra cada garagem.
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

  ["cpGaragem", "cpGaragemDestino"].forEach(id => {
    const select = $(id);
    const manterPrimeira = select.options[0]; // mantém "estoque geral" ou "selecione"
    select.innerHTML = "";
    select.appendChild(manterPrimeira);
    GARAGENS_CP.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.garagem;
      opt.textContent = g.garagem;
      select.appendChild(opt);
    });
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

  const alocadoPorGaragem = {}; // "" = estoque geral
  rows.forEach(r => {
    const garagem = r[0] || "";
    const empresa = r[1] || "";
    const quantidade = parseInt(r[2], 10) || 0;
    if (empresa === perfil.empresa) {
      alocadoPorGaragem[garagem] = (alocadoPorGaragem[garagem] || 0) + quantidade;
    }
  });

  const list = $("listaEstoqueContraprova");
  list.innerHTML = "";

  const linhas = [];

  const estoqueGeral = alocadoPorGaragem[""] || 0;
  if (estoqueGeral > 0) {
    linhas.push({ nome: "📦 Estoque geral (sem garagem)", alocado: estoqueGeral, usado: 0 });
  }

  GARAGENS_CP.forEach(g => {
    const alocado = alocadoPorGaragem[g.garagem] || 0;
    if (alocado > 0) linhas.push({ nome: g.garagem, alocado, usado: uso[g.garagem] || 0 });
  });

  if (!linhas.length) {
    list.innerHTML = '<div class="empty-state">Nenhum teste de contraprova alocado ainda.</div>';
    return;
  }

  linhas.forEach(l => {
    const disponivel = l.alocado - l.usado;
    const pillClass = disponivel <= 0 ? "error" : disponivel <= 2 ? "warn" : "ok";
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div>
        <div>${l.nome}</div>
        <div class="muted mono">Usado ${l.usado}/${l.alocado}</div>
      </div>
      <span class="pill ${pillClass}">${disponivel} ${disponivel === 1 ? "disponível" : "disponíveis"}</span>`;
    list.appendChild(row);
  });
}

async function alocarContraprova(ev) {
  ev.preventDefault();
  const perfil = getPerfil();
  if (!perfil) return;

  const garagem = $("cpGaragem").value; // pode ficar vazio = estoque geral
  const quantidade = parseInt($("cpQuantidade").value, 10);
  if (!quantidade || quantidade < 1) return;

  const btn = $("btnAlocarContraprova");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    await Sheets.appendRow(APP_CONFIG.sheets.contraprovaEstoque, [
      garagem, perfil.empresa, quantidade, new Date().toISOString().slice(0, 10), perfil.nome
    ]);
    toast(`${quantidade} teste(s) alocado(s) para ${garagem || "o estoque geral"}.`);
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

async function transferirContraprova(ev) {
  ev.preventDefault();
  const perfil = getPerfil();
  if (!perfil) return;

  const destino = $("cpGaragemDestino").value;
  const quantidade = parseInt($("cpQuantidadeTransferir").value, 10);
  if (!destino || !quantidade || quantidade < 1) return;

  const btn = $("btnTransferirContraprova");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Transferindo…';

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    // Sai do estoque geral (linha negativa) e entra na garagem de destino (linha positiva)
    await Sheets.appendRow(APP_CONFIG.sheets.contraprovaEstoque, [
      "", perfil.empresa, -quantidade, hoje, perfil.nome
    ]);
    await Sheets.appendRow(APP_CONFIG.sheets.contraprovaEstoque, [
      destino, perfil.empresa, quantidade, hoje, perfil.nome
    ]);
    toast(`${quantidade} teste(s) transferido(s) para ${destino}.`);
    $("formTransferirContraprova").reset();
    await carregarEstoqueContraprova();
  } catch (e) {
    if (window.Sheets && Sheets.tratarErroSessao(e)) return;
    toast("Erro ao transferir: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Transferir";
  }
}

async function initContraprova() {
  if (!document.getElementById("formContraprova")) return; // painel só existe no portal ADM
  await carregarGaragensParaContraprova();
  await carregarEstoqueContraprova();
  $("formContraprova").addEventListener("submit", alocarContraprova);
  $("formTransferirContraprova").addEventListener("submit", transferirContraprova);
}

initContraprova();