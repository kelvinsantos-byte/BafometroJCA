/**
 * ============================================================
 *  FISCALIZACAO.JS — Espelho de Testes (relatório de fiscalização)
 * ============================================================
 *  Busca todos os testes de um colaborador (por matrícula) num
 *  período, nas 3 regionais, e gera um relatório imprimível
 *  (mesma técnica do medida.js: página HTML + impressão do
 *  navegador, garantindo fidelidade total de layout).
 * ============================================================
 */

const $ = (id) => document.getElementById(id);

const LOGO_JCA_CLARO = "https://res.cloudinary.com/dln0ctawv/image/upload/v1786221931/jca-light_ymtxih.png";

let MOTORISTAS = [];

async function carregarMotoristas() {
  try {
    const resp = await fetch("data/motoristas.json");
    MOTORISTAS = await resp.json();
  } catch (e) {
    console.error("Não foi possível carregar motoristas.json", e);
    MOTORISTAS = [];
  }
}

/** Converte "dd/mm/yyyy, HH:mm:ss" (formato de dataHoraBR) pra Date */
function parseDataHoraBR(texto) {
  const m = String(texto || "").match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dia, mes, ano, h, min, s] = m;
  return new Date(+ano, +mes - 1, +dia, +h, +min, +s);
}

async function buscarTestesDoColaborador(matricula, dataInicio, dataFim) {
  const bases = [
    { base: "SAO", nome: APP_CONFIG.bases.SAO },
    { base: "RIO", nome: APP_CONFIG.bases.RIO },
    { base: "SUL", nome: APP_CONFIG.bases.SUL }
  ];

  const resultados = await Promise.all(
    bases.map(b => Sheets.getValues(`${b.nome}!A2:L`).catch(() => []))
  );

  const inicio = new Date(dataInicio + "T00:00:00");
  const fim = new Date(dataFim + "T23:59:59");

  const testes = [];
  resultados.forEach((rows, i) => {
    rows.forEach(r => {
      const motoristaTexto = r[4] || "";
      if (!motoristaTexto.includes(`mat. ${matricula}`)) return;

      const data = parseDataHoraBR(r[0]);
      if (!data || data < inicio || data > fim) return;

      testes.push({
        regional: bases[i].base,
        dataHoraTexto: r[0],
        data,
        setor: r[5] || "",
        resultado: r[6] || "",
        valor: r[7] || "",
        equipamento: r[10] || "",
        tentativa: r[11] || "1"
      });
    });
  });

  testes.sort((a, b) => (a.data?.getTime() || 0) - (b.data?.getTime() || 0));
  return testes;
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

function montarHtmlEspelho(dados) {
  const logoEmpresa = APP_CONFIG.companyBranding[dados.empresa]?.logo || "";

  const linhasTabela = dados.testes.map(t => `
    <tr>
      <td>${t.dataHoraTexto}</td>
      <td>${t.regional}</td>
      <td>${t.tentativa}/3</td>
      <td>${t.equipamento || "—"}</td>
      <td class="${classeResultado(t.resultado)}">${textoResultado(t.resultado)}</td>
      <td>${t.valor || "0.00"} MG/L</td>
    </tr>`).join("");

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Espelho de Testes — ${dados.nome}</title>
<style>
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

  table.testes { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.testes th, table.testes td { border: 1px solid #999; padding: 6px 7px; text-align: left; }
  table.testes th { background: #f0f0f0; font-size: 9px; text-transform: uppercase; }
  table.testes td.ok { color: #0a7d3c; font-weight: bold; }
  table.testes td.risco { color: #c0392b; font-weight: bold; }

  .rodape-resumo { margin-top: 14px; font-size: 10px; color: #444; }
  .empty { padding: 20px; text-align: center; color: #777; border: 1px dashed #ccc; }
</style>
</head>
<body>

<button class="botao-imprimir" onclick="window.print()">Imprimir / Salvar como PDF</button>
<div class="dica-impressao">Na caixa de impressão, clique em "Mais configurações" e desmarque "Cabeçalhos e rodapés" pra tirar a data/URL do topo e do rodapé.</div>

<div class="folha">

  <div class="cabecalho">
    <img src="${LOGO_JCA_CLARO}" alt="Grupo JCA">
    <div class="titulo">Espelho de Testes de Alcoolemia<br><span style="font-size:11px; font-weight:normal;">Relatório de Fiscalização</span></div>
    ${logoEmpresa ? `<img src="${logoEmpresa}" alt="${dados.empresa}">` : `<div style="width:60px;"></div>`}
  </div>

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
        <th>Data e Hora</th>
        <th>Regional</th>
        <th>Tentativa</th>
        <th>Etilômetro</th>
        <th>Resultado</th>
        <th>Valor</th>
      </tr>
    </thead>
    <tbody>
      ${linhasTabela}
    </tbody>
  </table>
  ` : `<div class="empty">Nenhum teste encontrado pra esse colaborador nesse período.</div>`}

  ${dados.testes.some(t => t.tentativa == 3 && classeResultado(t.resultado) === "risco") ? `
  <div style="margin-top:12px; padding:10px 12px; background:#fdecea; border:1px solid #c0392b; color:#c0392b; font-size:10.5px; font-weight:bold;">
    ⚠ Consta 3ª tentativa positiva no período — colaborador encaminhado para CONTRAPROVA.
  </div>` : ""}

  <p class="rodape-resumo">Relatório gerado em ${new Date().toLocaleString("pt-BR")} — Bafômetro JCA / Grupo JCA.</p>

</div>
</body>
</html>`;
}

function formatarDataCurta(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

async function gerarEspelho(ev) {
  ev.preventDefault();

  const matricula = $("fiMatricula").value.trim();
  const dataInicio = $("fiDataInicio").value;
  const dataFim = $("fiDataFim").value;

  if (!matricula || !dataInicio || !dataFim) return;

  const motorista = MOTORISTAS.find(m => String(m.matricula) === matricula);

  const btn = $("btnGerarEspelho");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Buscando…';

  try {
    const testes = await buscarTestesDoColaborador(matricula, dataInicio, dataFim);

    const dados = {
      matricula,
      nome: motorista?.nome || "",
      empresa: motorista?.empresa || "",
      setor: motorista?.setor || "",
      dataInicio, dataFim, testes
    };

    const janela = window.open("", "_blank");
    if (!janela) {
      alert("O navegador bloqueou a abertura da janela do relatório. Permita pop-ups pra este site.");
      return;
    }
    janela.document.write(montarHtmlEspelho(dados));
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
  $("formFiscalizacao").addEventListener("submit", gerarEspelho);
}

initFiscalizacao();