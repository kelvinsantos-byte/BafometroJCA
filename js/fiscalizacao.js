/**
 * ============================================================
 *  FISCALIZACAO.JS — Espelho de Testes (relatório de fiscalização)
 * ============================================================
 *  Três modos de relatório:
 *   - MOTORISTA: todos os testes de um colaborador num período
 *   - GARAGEM: todos os testes feitos numa garagem, agrupados por dia
 *   - CONTRATO: todos os testes feitos num contrato de fretamento,
 *     agrupados por dia
 *  Gera um relatório imprimível (página HTML + impressão do
 *  navegador, garantindo fidelidade total de layout).
 * ============================================================
 */

const $ = (id) => document.getElementById(id);

const LOGO_JCA_CLARO = "https://res.cloudinary.com/dln0ctawv/image/upload/v1786221931/jca-light_ymtxih.png";

let MOTORISTAS = [];

function getPerfil() {
  const raw = sessionStorage.getItem("baf_perfil");
  return raw ? JSON.parse(raw) : null;
}

async function carregarMotoristas() {
  try {
    const resp = await fetch("data/motoristas.json");
    MOTORISTAS = await resp.json();
  } catch (e) {
    console.error("Não foi possível carregar motoristas.json", e);
    MOTORISTAS = [];
  }
}

async function carregarGaragensEContratos() {
  const perfil = getPerfil();
  if (!perfil) return;

  const [garagemRows, contratoRows] = await Promise.all([
    Sheets.getValues(`${APP_CONFIG.sheets.recepcaoAtiva}!A2:B`),
    Sheets.getValues(`${APP_CONFIG.sheets.contratos}!A2:B`)
  ]);

  const garagemSelect = $("fiGaragem");
  garagemRows
    .filter(r => (r[0] || "") === perfil.empresa && r[1])
    .forEach(r => {
      const opt = document.createElement("option");
      opt.value = r[1];
      opt.textContent = r[1];
      garagemSelect.appendChild(opt);
    });

  const contratoSelect = $("fiContrato");
  contratoRows
    .filter(r => (r[0] || "") === perfil.empresa && r[1])
    .forEach(r => {
      const opt = document.createElement("option");
      opt.value = r[1];
      opt.textContent = r[1];
      contratoSelect.appendChild(opt);
    });
}

function aoTrocarTipoRelatorio() {
  const tipo = $("fiTipo").value;
  $("blocoFiMatricula").classList.toggle("hidden", tipo !== "MOTORISTA");
  $("blocoFiGaragem").classList.toggle("hidden", tipo !== "GARAGEM");
  $("blocoFiContrato").classList.toggle("hidden", tipo !== "CONTRATO");
  $("fiMatricula").required = tipo === "MOTORISTA";
  $("fiGaragem").required = tipo === "GARAGEM";
  $("fiContrato").required = tipo === "CONTRATO";
}

/** Converte "dd/mm/yyyy, HH:mm:ss" (formato de dataHoraBR) pra Date */
function parseDataHoraBR(texto) {
  const m = String(texto || "").match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dia, mes, ano, h, min, s] = m;
  return new Date(+ano, +mes - 1, +dia, +h, +min, +s);
}

async function buscarTestesBrutos(dataInicio, dataFim) {
  const bases = [
    { base: "SAO", nome: APP_CONFIG.bases.SAO },
    { base: "RIO", nome: APP_CONFIG.bases.RIO },
    { base: "SUL", nome: APP_CONFIG.bases.SUL }
  ];

  const resultados = await Promise.all(
    bases.map(b => Sheets.getValues(`${b.nome}!A2:M`).catch(() => []))
  );

  const inicio = new Date(dataInicio + "T00:00:00");
  const fim = new Date(dataFim + "T23:59:59");

  const testes = [];
  resultados.forEach((rows, i) => {
    rows.forEach(r => {
      const data = parseDataHoraBR(r[0]);
      if (!data || data < inicio || data > fim) return;

      testes.push({
        regional: bases[i].base,
        dataHoraTexto: r[0],
        data,
        empresa: r[1] || "",
        local: r[3] || "",
        motorista: r[4] || "",
        setor: r[5] || "",
        resultado: r[6] || "",
        valor: r[7] || "",
        equipamento: r[8] || "",
        tentativa: r[9] || "1",
        linkEvidencia: r[10] || "",
        contratoRelacionado: r[11] || "",
        tipoServico: r[12] || ""
      });
    });
  });

  testes.sort((a, b) => (a.data?.getTime() || 0) - (b.data?.getTime() || 0));
  return testes;
}

async function buscarTestesDoColaborador(matricula, dataInicio, dataFim) {
  const todos = await buscarTestesBrutos(dataInicio, dataFim);
  return todos.filter(t => t.motorista.includes(`mat. ${matricula}`));
}

/** Pra Garagem: testes aplicados diretamente ali (coluna local).
 *  Pra Contrato: junta os testes aplicados diretamente no contrato
 *  COM os testes aplicados numa garagem mas marcados como
 *  "relacionados" a esse contrato — nenhum fica de fora. */
async function buscarTestesPorLocal(nomeLocal, dataInicio, dataFim, tipo) {
  const todos = await buscarTestesBrutos(dataInicio, dataFim);
  if (tipo === "CONTRATO") {
    return todos.filter(t => t.local === nomeLocal || t.contratoRelacionado === nomeLocal);
  }
  return todos.filter(t => t.local === nomeLocal);
}

function textoResultado(resultado) {
  // Compatível com registros antigos (Aprovado/Reprovado)
  if (resultado === "Negativo" || resultado === "Aprovado") return "NEGATIVO";
  if (resultado === "Positivo" || resultado === "Reprovado") return "POSITIVO";
  return resultado || "—";
}

function classeResultado(resultado) {
  return (resultado === "Negativo" || resultado === "Aprovado") ? "ok" : "risco";
}

function formatarDataCurta(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function nomeMotorista(textoCompleto) {
  return (textoCompleto || "").split(" — mat. ")[0];
}

/* ------------------------------------------------------------ */
/* CSS compartilhado entre os dois layouts de relatório           */
/* ------------------------------------------------------------ */
const ESTILO_BASE = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; background: #d8dce2; }
  .folha { max-width: 210mm; margin: 0 auto; background: #fff; padding: 14mm; }
  @media print { body { background: #fff; } .folha { max-width: none; margin: 0; padding: 0; } .botao-imprimir, .dica-impressao { display: none; } }

  .botao-imprimir {
    position: fixed; top: 12px; right: 12px; z-index: 999;
    background: #00B4A6; color: #06110f; border: none; padding: 10px 18px;
    border-radius: 8px; font-weight: bold; cursor: pointer; font-family: Arial, sans-serif;
  }
  .dica-impressao {
    position: fixed; top: 52px; right: 12px; z-index: 999;
    max-width: 220px; font-size: 10px; color: #444; text-align: right;
    font-family: Arial, sans-serif; line-height: 1.4;
  }

  .cabecalho { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #111; padding-bottom: 12px; margin-bottom: 12px; }
  .cabecalho img { height: 48px; width: auto; max-width: 140px; object-fit: contain; }
  .cabecalho .titulo { flex: 1; text-align: center; font-size: 17px; font-weight: bold; line-height: 1.2; padding: 0 10px; }

  table.dados { width: 100%; border-collapse: collapse; margin-bottom: 14px; table-layout: fixed; }
  table.dados td { border: 1.5px solid #111; padding: 7px 9px; vertical-align: top; }
  .lbl { font-size: 7.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.02em; display: block; margin-bottom: 3px; white-space: nowrap; }
  .val { font-size: 12px; }

  h2.secao { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; margin: 16px 0 8px; border-bottom: 1px solid #111; padding-bottom: 4px; }
  h3.dia { font-size: 11px; font-weight: bold; margin: 14px 0 6px; background: #f0f0f0; padding: 5px 8px; }

  table.testes { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px; }
  table.testes th, table.testes td { border: 1px solid #999; padding: 6px 7px; text-align: left; }
  table.testes th { background: #f0f0f0; font-size: 9px; text-transform: uppercase; }
  table.testes td.ok { color: #0a7d3c; font-weight: bold; }
  table.testes td.risco { color: #c0392b; font-weight: bold; }

  .rodape-resumo { margin-top: 14px; font-size: 10px; color: #444; }
  .empty { padding: 20px; text-align: center; color: #777; border: 1px dashed #ccc; }
`;

function botaoEDica() {
  return `
<button class="botao-imprimir" onclick="window.print()">Imprimir / Salvar como PDF</button>
<div class="dica-impressao">Na caixa de impressão, clique em "Mais configurações" e desmarque "Cabeçalhos e rodapés" pra tirar a data/URL do topo e do rodapé.</div>`;
}

function cabecalho(titulo, subtitulo, logoEmpresa, empresa) {
  return `
  <div class="cabecalho">
    <img src="${LOGO_JCA_CLARO}" alt="Grupo JCA">
    <div class="titulo">${titulo}<br><span style="font-size:11px; font-weight:normal;">${subtitulo}</span></div>
    ${logoEmpresa ? `<img src="${logoEmpresa}" alt="${empresa}">` : `<div style="width:60px;"></div>`}
  </div>`;
}

/* ------------------------------------------------------------ */
/* RELATÓRIO POR MOTORISTA                                        */
/* ------------------------------------------------------------ */
function montarHtmlEspelhoMotorista(dados) {
  const logoEmpresa = APP_CONFIG.companyBranding[dados.empresa]?.logo || "";

  const linhasTabela = dados.testes.map(t => `
    <tr>
      <td>${t.dataHoraTexto}</td>
      <td>${t.regional}</td>
      <td>${t.tentativa === "CP" ? "Contraprova" : t.tentativa + "/3"}</td>
      <td>${t.equipamento || "—"}</td>
      <td class="${classeResultado(t.resultado)}">${textoResultado(t.resultado)}</td>
      <td>${t.valor || "0.00"} MG/L</td>
      <td>${t.linkEvidencia ? `<a href="${t.linkEvidencia}">Ver evidência</a>` : "—"}</td>
    </tr>`).join("");

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Espelho de Testes — ${dados.nome}</title>
<style>${ESTILO_BASE}</style>
</head>
<body>
${botaoEDica()}
<div class="folha">
  ${cabecalho("Espelho de Testes de Alcoolemia", "Relatório de Fiscalização — Motorista", logoEmpresa, dados.empresa)}

  <table class="dados">
    <tr>
      <td style="width:60%">
        <span class="lbl">Nome do Colaborador</span>
        <span class="val">${dados.nome || "—"}</span>
      </td>
      <td>
        <span class="lbl">Matrícula</span>
        <span class="val">${dados.matricula}</span>
      </td>
    </tr>
    <tr>
      <td>
        <span class="lbl">Empresa</span>
        <span class="val">${dados.empresa || "—"}</span>
      </td>
      <td>
        <span class="lbl">Setor</span>
        <span class="val">${dados.setor || "—"}</span>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="lbl">Período consultado</span>
        <span class="val">${formatarDataCurta(dados.dataInicio)} a ${formatarDataCurta(dados.dataFim)}</span>
      </td>
    </tr>
  </table>

  <h2 class="secao">Testes realizados no período (${dados.testes.length})</h2>

  ${dados.testes.length ? `
  <table class="testes">
    <thead>
      <tr>
        <th>Data e Hora</th><th>Regional</th><th>Tentativa</th><th>Etilômetro</th>
        <th>Resultado</th><th>Valor</th><th>Evidência</th>
      </tr>
    </thead>
    <tbody>${linhasTabela}</tbody>
  </table>
  ` : `<div class="empty">Nenhum teste encontrado pra esse colaborador nesse período.</div>`}

  ${dados.testes.some(t => t.tentativa == 3 && classeResultado(t.resultado) === "risco") ? `
  <div style="margin-top:12px; padding:10px 12px; background:#fdecea; border:1px solid #c0392b; color:#c0392b; font-size:10.5px; font-weight:bold;">
    ⚠ Consta 3ª tentativa positiva no período — colaborador encaminhado para CONTRAPROVA.
  </div>` : ""}
  ${dados.testes.some(t => t.tentativa === "CP" && classeResultado(t.resultado) === "risco") ? `
  <div style="margin-top:8px; padding:10px 12px; background:#fdecea; border:2px solid #c0392b; color:#c0392b; font-size:10.5px; font-weight:bold;">
    ⚠⚠ Contraprova também positiva no período — colaborador encaminhado para o GESTOR.
  </div>` : ""}

  <p class="rodape-resumo">Relatório gerado em ${new Date().toLocaleString("pt-BR")} — Bafômetro JCA / Grupo JCA.</p>
</div>
</body>
</html>`;
}

/* ------------------------------------------------------------ */
/* RELATÓRIO POR GARAGEM / CONTRATO — agrupado por dia             */
/* ------------------------------------------------------------ */
function agruparPorDia(testes) {
  const grupos = {};
  testes.forEach(t => {
    const chave = t.data.toLocaleDateString("pt-BR");
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(t);
  });
  return grupos;
}

function montarHtmlEspelhoLocal(dados) {
  const logoEmpresa = APP_CONFIG.companyBranding[dados.empresa]?.logo || "";
  const grupos = agruparPorDia(dados.testes);
  const dias = Object.keys(grupos); // já vem ordenado, pois dados.testes já está ordenado por data

  const blocosPorDia = dias.map(dia => {
    const linhas = grupos[dia].map(t => {
      const origem = dados.tipo === "CONTRATO"
        ? `<td>${t.local === dados.local ? "Direto no contrato" : "Garagem " + t.local}</td>`
        : "";
      return `
      <tr>
        <td>${t.dataHoraTexto.split(",")[1]?.trim() || t.dataHoraTexto}</td>
        <td>${nomeMotorista(t.motorista)}</td>
        <td>${t.setor || "—"}</td>
        ${origem}
        <td>${t.tentativa === "CP" ? "Contraprova" : t.tentativa + "/3"}</td>
        <td class="${classeResultado(t.resultado)}">${textoResultado(t.resultado)}</td>
        <td>${t.valor || "0.00"} MG/L</td>
      </tr>`;
    }).join("");

    const thOrigem = dados.tipo === "CONTRATO" ? "<th>Origem</th>" : "";
    return `
    <h3 class="dia">${dia} — ${grupos[dia].length} teste(s)</h3>
    <table class="testes">
      <thead>
        <tr><th>Hora</th><th>Motorista</th><th>Setor</th>${thOrigem}<th>Tentativa</th><th>Resultado</th><th>Valor</th></tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
  }).join("");

  const tipoTexto = dados.tipo === "GARAGEM" ? "Garagem" : "Contrato de Fretamento";

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Espelho de Testes — ${dados.local}</title>
<style>${ESTILO_BASE}</style>
</head>
<body>
${botaoEDica()}
<div class="folha">
  ${cabecalho("Espelho de Testes de Alcoolemia", `Relatório de Fiscalização — ${tipoTexto}`, logoEmpresa, dados.empresa)}

  <table class="dados">
    <tr>
      <td style="width:60%">
        <span class="lbl">${tipoTexto}</span>
        <span class="val">${dados.local || "—"}</span>
      </td>
      <td>
        <span class="lbl">Empresa</span>
        <span class="val">${dados.empresa || "—"}</span>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="lbl">Período consultado</span>
        <span class="val">${formatarDataCurta(dados.dataInicio)} a ${formatarDataCurta(dados.dataFim)}</span>
      </td>
    </tr>
  </table>

  <h2 class="secao">Testes realizados no período (${dados.testes.length}) — ${dias.length} dia(s) com movimento</h2>

  ${dados.testes.length ? blocosPorDia : `<div class="empty">Nenhum teste encontrado nesse local, nesse período.</div>`}

  <p class="rodape-resumo">Relatório gerado em ${new Date().toLocaleString("pt-BR")} — Bafômetro JCA / Grupo JCA.</p>
</div>
</body>
</html>`;
}

/* ------------------------------------------------------------ */
/* SUBMIT                                                          */
/* ------------------------------------------------------------ */
async function gerarEspelho(ev) {
  ev.preventDefault();

  const perfil = getPerfil();
  const tipo = $("fiTipo").value;
  const dataInicio = $("fiDataInicio").value;
  const dataFim = $("fiDataFim").value;
  if (!dataInicio || !dataFim) return;

  const btn = $("btnGerarEspelho");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Buscando…';

  try {
    let html;

    if (tipo === "MOTORISTA") {
      const matricula = $("fiMatricula").value.trim();
      if (!matricula) return;
      const motorista = MOTORISTAS.find(m => String(m.matricula) === matricula);
      const testes = await buscarTestesDoColaborador(matricula, dataInicio, dataFim);
      html = montarHtmlEspelhoMotorista({
        matricula, nome: motorista?.nome || "", empresa: motorista?.empresa || perfil?.empresa || "",
        setor: motorista?.setor || "", dataInicio, dataFim, testes
      });
    } else {
      const local = tipo === "GARAGEM" ? $("fiGaragem").value : $("fiContrato").value;
      if (!local) return;
      const testes = await buscarTestesPorLocal(local, dataInicio, dataFim, tipo);
      html = montarHtmlEspelhoLocal({
        tipo, local, empresa: perfil?.empresa || "", dataInicio, dataFim, testes
      });
    }

    const janela = window.open("", "_blank");
    if (!janela) {
      alert("O navegador bloqueou a abertura da janela do relatório. Permita pop-ups pra este site.");
      return;
    }
    janela.document.write(html);
    janela.document.close();
  } catch (e) {
    if (window.Sheets && Sheets.tratarErroSessao(e)) return;
    alert("Erro ao buscar os testes: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Gerar Espelho (PDF)";
  }
}

async function initFiscalizacao() {
  if (!document.getElementById("formFiscalizacao")) return; // painel só existe no portal ADM
  await carregarMotoristas();
  await carregarGaragensEContratos();
  $("fiTipo").addEventListener("change", aoTrocarTipoRelatorio);
  $("formFiscalizacao").addEventListener("submit", gerarEspelho);
  $("fiMatricula").addEventListener("input", () => {
    const pos = $("fiMatricula").selectionStart;
    $("fiMatricula").value = $("fiMatricula").value.toUpperCase();
    $("fiMatricula").setSelectionRange(pos, pos);
  });
}

initFiscalizacao();