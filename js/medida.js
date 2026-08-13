/**
 * ============================================================
 *  MEDIDA.JS — Termo de Medida Disciplinar
 * ============================================================
 *  Gera o termo no layout oficial do Grupo JCA e abre a caixa de
 *  impressão do navegador (o usuário escolhe "Salvar como PDF").
 *  Essa abordagem garante fidelidade total ao modelo fornecido,
 *  sem depender de bibliotecas externas de geração de PDF.
 * ============================================================
 */

const $ = (id) => document.getElementById(id);

const LOGO_JCA_ESCURO = "https://res.cloudinary.com/dln0ctawv/image/upload/v1786221931/jca-dark_feydzd.png";
const LOGO_JCA_CLARO  = "https://res.cloudinary.com/dln0ctawv/image/upload/v1786221931/jca-light_ymtxih.png";

let MOTORISTAS = [];
let funcionarioSelecionado = null;

async function carregarMotoristas() {
  try {
    const resp = await fetch("data/motoristas.json");
    MOTORISTAS = await resp.json();
  } catch (e) {
    console.error("Não foi possível carregar motoristas.json", e);
    MOTORISTAS = [];
  }
}

function filtrarFuncionarios(texto) {
  const termo = texto.trim().toLowerCase();
  if (!termo) return [];
  return MOTORISTAS.filter(m =>
    m.nome.toLowerCase().includes(termo) || String(m.matricula).includes(termo)
  ).slice(0, 8);
}

function renderSugestoesFuncionario(lista) {
  const box = $("mdFuncionarioSugestoes");
  box.innerHTML = "";
  if (!lista.length) { box.classList.add("hidden"); return; }

  lista.forEach(m => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    item.innerHTML = `${m.nome} <span class="mat">mat. ${m.matricula}</span>`;
    item.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      selecionarFuncionario(m);
    });
    box.appendChild(item);
  });
  box.classList.remove("hidden");
}

function selecionarFuncionario(m) {
  funcionarioSelecionado = m;
  $("mdFuncionarioInput").value = `${m.nome} — mat. ${m.matricula}`;
  $("mdMatricula").value = m.matricula;
  $("mdEmpresa").value = m.empresa;
  renderSugestoesFuncionario([]);
}

function aoDigitarFuncionario() {
  const texto = $("mdFuncionarioInput").value;
  if (funcionarioSelecionado && texto !== `${funcionarioSelecionado.nome} — mat. ${funcionarioSelecionado.matricula}`) {
    funcionarioSelecionado = null;
    $("mdMatricula").value = "";
    $("mdEmpresa").value = "";
  }
  renderSugestoesFuncionario(filtrarFuncionarios(texto));
}

function aoTrocarTipoMedida() {
  const tipo = $("mdTipoMedida").value;
  const match = tipo.match(/Suspensão de (\d+) dias?/);
  $("mdDuracao").value = match ? `${match[1]} dia${match[1] === "1" ? "" : "s"}` : "";
}

/** Monta o texto padrão das observações usando o valor do resultado (mg/L) */
function aoTrocarDoseResultado() {
  const dose = $("mdDoseResultado").value.trim();
  if (!dose) return;
  $("mdObservacoes").value =
    `Colaborador reprovado no teste de etilômetro, resultando em sua inaptidão para assumir a operação e conduzir o veículo, prevenindo a exposição da operação a riscos e reforçando o compromisso com a segurança — resultado do teste: ${dose} MG/L.`;
}

/** Alterna entre "Teste Positivo" (pede o resultado em mg/L) e "Recusa"
 *  (esconde o campo de resultado, já que não houve teste, e preenche
 *  as observações com o texto padrão de recusa) */
function aoTrocarMotivoFato() {
  const motivo = $("mdMotivoFato").value;
  const ehRecusa = motivo === "Recusou realizar teste de alcoolemia";

  $("blocoDoseResultado").classList.toggle("hidden", ehRecusa);

  if (ehRecusa) {
    $("mdDoseResultado").value = "";
    $("mdObservacoes").value =
      "Colaborador recusou-se a realizar o teste de etilômetro, descumprindo o procedimento de segurança estabelecido para liberação à operação.";
  } else {
    $("mdObservacoes").value = "";
  }
}

function formatarDataExtenso(iso) {
  if (!iso) return { dia: "____", mes: "____________", ano: "____" };
  const [ano, mes, dia] = iso.split("-");
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return { dia, mes: meses[parseInt(mes, 10) - 1] || mes, ano };
}

function preencherOrientadorComPerfil() {
  try {
    const raw = sessionStorage.getItem("baf_perfil");
    if (!raw) return;
    const perfil = JSON.parse(raw);
    $("mdOrientadorNome").value = perfil.nome || "";
    $("mdOrientadorMatricula").value = perfil.matricula || "";
  } catch (e) { /* ignora */ }
}

function montarHtmlTermo(d) {
  const dataAplicada = formatarDataExtenso(d.dataAplicada);

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Termo de Medida Disciplinar</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; background: #d8dce2; }
  .folha { max-width: 210mm; margin: 0 auto; background: #fff; padding: 14mm; }
  @media print {
    body { background: #fff; }
    .folha { max-width: none; margin: 0; padding: 0; }
  }
  .cabecalho { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #111; padding-bottom: 12px; margin-bottom: 12px; }
  .cabecalho img { height: 56px; width: auto; }
  .cabecalho .titulo { flex: 1; font-size: 20px; font-weight: bold; line-height: 1.2; text-align: center; }

  table.termo td { border: 1.5px solid #111; padding: 7px 9px; vertical-align: top; }

  p.corpo {
    text-align: justify; line-height: 1.6; margin: 10px 0; padding: 10px 12px;
    background: #f0f0f0; border: 1px solid #ccc;
  }
  table.termo { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 10px; }
  table.termo td { border: 1px solid #111; padding: 6px 8px; vertical-align: top; }
  .lbl { font-size: 7.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.02em; display: block; margin-bottom: 3px; white-space: nowrap; }
  .val { font-size: 12px; }
  .val.grande { font-size: 13px; font-weight: bold; }
  .campo-texto { border: 1px solid #111; padding: 8px; min-height: 50px; margin-bottom: 10px; }
  .campo-texto .lbl { margin-bottom: 6px; }
  .linha-data { margin: 22px 0 34px; font-size: 12px; display: flex; justify-content: space-between; align-items: baseline; gap: 20px; }
  .assinaturas { display: flex; justify-content: space-between; gap: 40px; margin-top: 10px; }
  .assinatura { flex: 1; }
  .assinatura .linha { border-top: 1px solid #111; margin-bottom: 4px; padding-top: 4px; }
  .assinatura strong { font-size: 11px; }
  .assinatura .campo { font-size: 11px; margin-top: 10px; }
  .testemunhas-titulo { text-align: center; font-weight: bold; margin: 26px 0 10px; font-size: 11px; }
  .rodape { margin-top: 30px; font-size: 9.5px; text-align: justify; line-height: 1.5; }
  @media print {
    .botao-imprimir { display: none; }
  }
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
  @media print { .dica-impressao { display: none; } }
</style>
</head>
<body>

<button class="botao-imprimir" onclick="window.print()">Imprimir / Salvar como PDF</button>
<div class="dica-impressao">Na caixa de impressão, clique em "Mais configurações" e desmarque "Cabeçalhos e rodapés" pra tirar a data/URL do topo e do rodapé.</div>

<div class="folha">

<div class="cabecalho">
  <img src="${LOGO_JCA_CLARO}" alt="Grupo JCA" onerror="this.src='${LOGO_JCA_ESCURO}'">
  <div class="titulo">Termo de Medida<br>Disciplinar</div>
</div>

<table class="termo">
  <tr>
    <td colspan="3">
      <span class="lbl">Nome do Funcionário</span>
      <span class="val">${d.nome || "—"}</span>
    </td>
    <td>
      <span class="lbl">Matrícula</span>
      <span class="val">${d.matricula || "—"}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Tipo de Medida</span>
      <span class="val grande">${d.tipoMedida || "—"}</span>
    </td>
    <td>
      <span class="lbl">Empresa</span>
      <span class="val">${d.empresa || "—"}</span>
    </td>
    <td>
      <span class="lbl">Duração (se aplicável)</span>
      <span class="val">${d.duracao || "—"}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="lbl">Data da Ocorrência</span>
      <span class="val">${formatarDataCurta(d.dataOcorrencia)}</span>
    </td>
    <td>
      <span class="lbl">Data da Aplicada</span>
      <span class="val">${formatarDataCurta(d.dataAplicada)}</span>
    </td>
    <td>
      <span class="lbl">Cargo</span>
      <span class="val">${d.cargo || "—"}</span>
    </td>
    <td>
      <span class="lbl">Prefixo (se aplicável)</span>
      <span class="val">${d.prefixo || "—"}</span>
    </td>
  </tr>
</table>

<p class="corpo">
  A presente ${d.tipoMedida || "Instrução de Serviço"} está sendo aplicada com o objetivo de registrar formalmente a
  ocorrência e reforçar o cumprimento dos procedimentos internos, visando manter a disciplina, a segurança
  e a qualidade na execução das atividades. Fica ciente que o documento foi produzido em duas vias, sendo
  uma da empresa e a segunda do funcionário, e que a reincidência poderá resultar na aplicação de medidas
  disciplinares mais severas, conforme normas internas e legislação vigente.
</p>

<div class="campo-texto">
  <span class="lbl">Motivo do Fato</span>
  <div class="val">${(d.motivoFato || "—").replace(/\n/g, "<br>")}</div>
</div>

<div class="campo-texto">
  <span class="lbl">Observações</span>
  <div class="val">${(d.observacoes || "—").replace(/\n/g, "<br>")}</div>
</div>

<div class="campo-texto" style="min-height:24px;">
  <span class="lbl">Local e Hora</span>
  <div class="val">${d.localHora || "—"}</div>
</div>

<div class="linha-data">
  <span>${dataAplicada.dia} de ${dataAplicada.mes} de ${dataAplicada.ano}.</span>
  <span>Ciente em _____ de _____________ de _______.</span>
</div>

<div class="assinaturas">
  <div class="assinatura">
    <div class="linha"><strong>Grupo JCA</strong></div>
    <div class="campo">Orientador: ${d.orientadorNome || "_____________________________"}</div>
    <div class="campo">Matrícula: ${d.orientadorMatricula || "_____________________________"}</div>
  </div>
  <div class="assinatura">
    <div class="linha"><strong>Funcionário</strong></div>
    <div class="campo">Nome: ${d.nome || "_____________________________"}</div>
    <div class="campo">Matrícula: ${d.matricula || "_____________________________"}</div>
  </div>
</div>

<div class="testemunhas-titulo">Testemunhas</div>
<div class="assinaturas">
  <div class="assinatura">
    <div class="linha"></div>
    <div class="campo">Nome: ${d.test1Nome || "_____________________________"}</div>
    <div class="campo">Matrícula: ${d.test1Matricula || "_____________________________"}</div>
  </div>
  <div class="assinatura">
    <div class="linha"></div>
    <div class="campo">Nome: ${d.test2Nome || "_____________________________"}</div>
    <div class="campo">Matrícula: ${d.test2Matricula || "_____________________________"}</div>
  </div>
</div>

<p class="rodape">
  Em caso de recusa do empregado em dar ciência do recebimento desta comunicação, seu conteúdo deverá ser lido, na
  presença do colaborador e na de duas testemunhas que acima assinam, em _____ de ____________________ de 20_____.
</p>

</div>
</body>
</html>`;
}

function formatarDataCurta(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function gerarTermo(ev) {
  ev.preventDefault();

  if (!funcionarioSelecionado) {
    alert("Selecione o funcionário na lista de sugestões antes de gerar o termo.");
    return;
  }

  const dados = {
    nome: funcionarioSelecionado.nome,
    matricula: $("mdMatricula").value,
    empresa: $("mdEmpresa").value,
    cargo: $("mdCargo").value,
    prefixo: $("mdPrefixo").value,
    tipoMedida: $("mdTipoMedida").value,
    duracao: $("mdDuracao").value,
    dataOcorrencia: $("mdDataOcorrencia").value,
    dataAplicada: $("mdDataAplicada").value,
    motivoFato: $("mdMotivoFato").value,
    observacoes: $("mdObservacoes").value,
    localHora: $("mdLocalHora").value,
    orientadorNome: $("mdOrientadorNome").value,
    orientadorMatricula: $("mdOrientadorMatricula").value
  };

  const janela = window.open("", "_blank");
  if (!janela) {
    alert("O navegador bloqueou a abertura da janela do termo. Permita pop-ups pra este site.");
    return;
  }
  janela.document.write(montarHtmlTermo(dados));
  janela.document.close();
}

async function initMedida() {
  if (!document.getElementById("formMedida")) return; // painel só existe no portal ADM

  await carregarMotoristas();
  preencherOrientadorComPerfil();

  $("mdFuncionarioInput").addEventListener("input", aoDigitarFuncionario);
  $("mdFuncionarioInput").addEventListener("blur", () => {
    setTimeout(() => renderSugestoesFuncionario([]), 150);
  });
  $("mdTipoMedida").addEventListener("change", aoTrocarTipoMedida);
  $("mdMotivoFato").addEventListener("change", aoTrocarMotivoFato);
  $("mdDoseResultado").addEventListener("input", aoTrocarDoseResultado);
  $("formMedida").addEventListener("submit", gerarTermo);
}

initMedida();

/* ---------------------------------------------------------- */
/* MAIÚSCULO AUTOMÁTICO                                         */
/* ---------------------------------------------------------- */

function aplicarMaiusculoAutomaticoMedida(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      const pos = el.selectionStart;
      el.value = el.value.toUpperCase();
      el.setSelectionRange(pos, pos);
    });
  });
}

aplicarMaiusculoAutomaticoMedida(["mdPrefixo", "mdLocalHora", "mdOrientadorNome", "mdOrientadorMatricula"]);