/**
 * ============================================================
 *  OPERACAO.JS — Portal de uso operacional (aplicadores/instrutores)
 * ============================================================
 */

let PERFIL = null;
let MOTORISTAS = [];
let EQUIPAMENTOS = []; // [{rowIndex, modelo, serie, afericao, validade, status}]
let MANUTENCOES = [];  // registros da aba MANUTENÇÃO EQUIPAMENTOS
let motoristaAtual = null; // registro completo do motorista escolhido ({matricula, nome, empresa, setor})
let resultadoSelecionado = null;
let retestesPendentes = []; // [{id, dia, motorista, matricula, empresa, tentativa, expiraEm, notificado, contraprova}]

const RETESTE_MINUTOS = 5;
const RETESTE_LS_KEY = "baf_retestes_pendentes";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("visible");
  setTimeout(() => t.classList.remove("visible"), 3000);
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function dataHoraBR() {
  return new Date().toLocaleString("pt-BR");
}

/** Converte "dd/mm/yyyy, HH:mm:ss" (formato de dataHoraBR) de volta pra um Date */
function parseDataHoraBR(texto) {
  const m = String(texto || "").match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dia, mes, ano, h, min, s] = m;
  return new Date(+ano, +mes - 1, +dia, +h, +min, +s);
}

/** Converte uma data de equipamento (aferição/validade) pra Date, aceitando tanto
 *  "yyyy-mm-dd" (ISO, como o <input type="date"> grava) quanto "dd/mm/yyyy"
 *  (formato que o Google Sheets costuma devolver ao ler célula formatada como data).
 *  Sem isso, comparações de vencimento podem falhar silenciosamente. */
function parseDataEquipamento(str) {
  if (!str) return null;
  const iso = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], 23, 59, 59);
  const br = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1], 23, 59, 59);
  return null;
}

function aplicarLogoEmpresa(empresa) {
  const branding = APP_CONFIG.companyBranding[empresa];
  const img = $("companyLogo");
  if (branding && img) {
    img.src = branding.logo;
    img.alt = empresa;
    img.style.display = "block";
    img.onerror = () => { img.style.display = "none"; };
    document.documentElement.style.setProperty("--company-color", branding.color);
  }
}

function aplicarAvatarGoogle() {
  const usuario = Auth.getCurrentUser();
  const img = $("userAvatar");
  if (usuario?.picture && img) {
    img.alt = usuario.name || "";
    img.onerror = () => { img.style.display = "none"; };
    img.src = usuario.picture;
    img.style.display = "block";
  }
}

/* ---------------------------------------------------------- */
/* RETESTES PENDENTES (timer de 5min, até 3 tentativas/dia)      */
/* ---------------------------------------------------------- */

function carregarRetestesPendentesLS() {
  try {
    const raw = localStorage.getItem(RETESTE_LS_KEY);
    retestesPendentes = raw ? JSON.parse(raw) : [];
  } catch (e) {
    retestesPendentes = [];
  }
  // Descarta pendências de dias anteriores — o contador de tentativas é por dia
  const hoje = hojeISO();
  retestesPendentes = retestesPendentes.filter(r => r.dia === hoje);
  salvarRetestesPendentesLS();
}

function salvarRetestesPendentesLS() {
  localStorage.setItem(RETESTE_LS_KEY, JSON.stringify(retestesPendentes));
}

/** Registra (ou avança) a cadeia de tentativas desse motorista — chamado
 *  sempre que um resultado Positivo é registrado (seja o teste original
 *  ou um reteste). Depois da 3ª tentativa positiva, marca contraprova
 *  em vez de abrir um novo timer. */
function iniciarOuAvancarTimerReteste({ motorista, matricula, empresa, tentativaConcluida }) {
  let entrada = retestesPendentes.find(r => r.matricula === matricula);

  if (tentativaConcluida >= 3) {
    // A 3ª tentativa (a que acabou de ser enviada) também foi positiva
    // -> encaminha pra contraprova, sem novo timer/reteste.
    if (!entrada) {
      entrada = {
        id: `${matricula}-${Date.now()}`, dia: hojeISO(), motorista, matricula, empresa,
        tentativa: 3, expiraEm: null, notificado: true, contraprova: true, encaminhadoGestor: false
      };
      retestesPendentes.push(entrada);
    } else {
      entrada.tentativa = 3;
      entrada.contraprova = true;
      entrada.expiraEm = null;
      entrada.notificado = true;
    }
  } else if (entrada) {
    entrada.tentativa = tentativaConcluida;
    entrada.expiraEm = Date.now() + RETESTE_MINUTOS * 60 * 1000;
    entrada.notificado = false;
  } else {
    retestesPendentes.push({
      id: `${matricula}-${Date.now()}`,
      dia: hojeISO(),
      motorista, matricula, empresa,
      tentativa: tentativaConcluida, // 1 = já fez a 1ª (o teste original)
      expiraEm: Date.now() + RETESTE_MINUTOS * 60 * 1000,
      notificado: false,
      contraprova: false,
      encaminhadoGestor: false
    });
  }

  salvarRetestesPendentesLS();
  renderRetestes();
}

/** Cadeia de tentativas do motorista atualmente selecionado, se houver (hoje) */
function retestePendenteDoMotoristaAtual() {
  if (!motoristaAtual) return null;
  return retestesPendentes.find(r => r.matricula === String(motoristaAtual.matricula)) || null;
}

function formatarContagem(msRestante) {
  const totalSeg = Math.max(0, Math.ceil(msRestante / 1000));
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

function renderRetestes() {
  const painel = $("painelRetestes");
  const lista = $("listaRetestes");

  if (!retestesPendentes.length) {
    painel.classList.add("hidden");
    lista.innerHTML = "";
  } else {
    painel.classList.remove("hidden");
    lista.innerHTML = "";
    retestesPendentes.forEach(r => {
      const restante = r.expiraEm ? r.expiraEm - Date.now() : -1;
      const pronto = !r.contraprova && restante <= 0;
      const item = document.createElement("div");
      item.className = "reteste-item" + (pronto || r.contraprova ? " pronto" : "");
      const statusTexto = r.encaminhadoGestor
        ? "GESTOR"
        : (r.contraprova ? "CONTRAPROVA" : (pronto ? "PRONTO" : formatarContagem(restante)));
      item.innerHTML = `
        <div>
          <div class="reteste-item-nome">${r.motorista}</div>
          <div class="reteste-item-empresa">${r.empresa} · tentativa ${r.tentativa}/3</div>
        </div>
        <div class="reteste-item-timer">${statusTexto}</div>`;
      item.addEventListener("click", () => {
        const m = MOTORISTAS.find(mm => String(mm.matricula) === r.matricula);
        if (m) selecionarMotorista(m);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      lista.appendChild(item);
    });
  }

  atualizarBannerReteste();
}

/** Roda a cada segundo: atualiza contagens e dispara notificação quando um timer expira */
function tickRetestes() {
  if (!retestesPendentes.length) return;
  let mudou = false;

  retestesPendentes.forEach(r => {
    if (!r.contraprova && !r.notificado && r.expiraEm && Date.now() >= r.expiraEm) {
      r.notificado = true;
      mudou = true;
      toast(`⏰ Hora do reteste (tentativa ${r.tentativa + 1}/3): ${r.motorista}`);
    }
  });

  if (mudou) salvarRetestesPendentesLS();
  renderRetestes();
}

function atualizarBannerReteste() {
  const banner = $("bannerReteste");
  const pendente = retestePendenteDoMotoristaAtual();
  atualizarBlocoEvidencia(pendente);

  if (!pendente) {
    banner.className = "banner hidden";
    return;
  }

  if (pendente.encaminhadoGestor) {
    banner.className = "banner error";
    banner.innerHTML = `<span class="status-dot error"></span><span><strong>Encaminhar o motorista para o Gestor</strong> — a contraprova também deu positiva. Não é possível registrar mais nenhum teste pra esse motorista hoje.</span>`;
    return;
  }

  if (pendente.contraprova) {
    banner.className = "banner warn";
    banner.innerHTML = `<span class="status-dot warn"></span><span><strong>Contraprova disponível</strong> — o motorista atingiu 3 resultados positivos hoje. Anexe a evidência (foto/PDF) abaixo e registre o resultado da contraprova.</span>`;
    return;
  }

  const restante = pendente.expiraEm - Date.now();
  const proximaTentativa = pendente.tentativa + 1;
  if (restante > 0) {
    banner.className = "banner warn";
    banner.innerHTML = `<span class="status-dot warn"></span><span>Aguardando tempo mínimo pro reteste (tentativa ${proximaTentativa}/3) — faltam ${formatarContagem(restante)}.</span>`;
  } else {
    banner.className = "banner ok";
    banner.innerHTML = `<span class="status-dot ok"></span><span>Pronto para o reteste (tentativa ${proximaTentativa}/3).</span>`;
  }
}

/** Mostra o campo de upload de evidência (e esconde o de Equipamento —
 *  contraprova é kit descartável, não aparelho cadastrado) só quando essa
 *  submissão vai ser a contraprova em si (não nos retestes normais 1/2/3). */
function atualizarBlocoEvidencia(pendente) {
  const bloco = $("blocoEvidenciaContraprova");
  const blocoEquip = $("blocoEquipamento");
  const ehContraprovaAgora = pendente && pendente.contraprova && !pendente.encaminhadoGestor;

  bloco.classList.toggle("hidden", !ehContraprovaAgora);
  blocoEquip.classList.toggle("hidden", ehContraprovaAgora);
  $("campoEquipamento").required = !ehContraprovaAgora;

  if (!ehContraprovaAgora) {
    $("campoEvidenciaContraprova").value = "";
    ultimaChecagemEstoqueKey = null;
    estoqueContraprovaAtual = null;
    $("bannerEstoqueContraprova").className = "banner hidden";
    return;
  }

  // Só refaz a checagem de estoque (chamada ao Sheets) quando a combinação
  // motorista+garagem+local realmente mudou — evita bater na API a cada
  // segundo (o tick do cronômetro chama essa função o tempo todo).
  const chave = `${pendente.matricula}|${$("campoLocalTipo").value}|${$("campoGaragem").value}`;
  if (chave === ultimaChecagemEstoqueKey) return;
  ultimaChecagemEstoqueKey = chave;
  atualizarEstoqueContraprovaUI(true);
}

let estoqueContraprovaAtual = null; // { garagem, disponivel } do último check feito
let ultimaChecagemEstoqueKey = null; // evita rechecar o estoque a cada tick do timer

/** Soma tudo que já foi alocado pra essa garagem (aba CONTRAPROVA ESTOQUE)
 *  e conta quantos "CP" (contraprovas já usadas) existem nas abas BASE. */
async function verificarEstoqueContraprova(garagem) {
  const [estoqueRows, saoRows, rioRows, sulRows] = await Promise.all([
    Sheets.getValues(`${APP_CONFIG.sheets.contraprovaEstoque}!A2:C`),
    Sheets.getValues(`${APP_CONFIG.bases.SAO}!D2:J`),
    Sheets.getValues(`${APP_CONFIG.bases.RIO}!D2:J`),
    Sheets.getValues(`${APP_CONFIG.bases.SUL}!D2:J`)
  ]);

  let alocado = 0;
  estoqueRows.forEach(r => { if (r[0] === garagem) alocado += parseInt(r[2], 10) || 0; });

  let usado = 0;
  [saoRows, rioRows, sulRows].forEach(rows => {
    rows.forEach(r => {
      // Faixa buscada foi D2:J -> r[0]=D(Contrato/Local) ... r[6]=J(Tentativa)
      if (r[0] === garagem && r[6] === "CP") usado++;
    });
  });

  return { alocado, usado, disponivel: alocado - usado };
}

async function atualizarEstoqueContraprovaUI(ehContraprovaAgora) {
  const banner = $("bannerEstoqueContraprova");

  if (!ehContraprovaAgora) {
    banner.className = "banner hidden";
    estoqueContraprovaAtual = null;
    validarFormularioTeste();
    return;
  }

  const localTipo = $("campoLocalTipo").value;
  const garagem = $("campoGaragem").value;

  if (localTipo !== "GARAGEM" || !garagem) {
    banner.className = "banner warn";
    banner.innerHTML = `<span class="status-dot warn"></span><span>Selecione "Garagem" no Local de Aplicação — é lá que ficam os kits de contraprova.</span>`;
    estoqueContraprovaAtual = null;
    validarFormularioTeste();
    return;
  }

  banner.className = "banner warn";
  banner.innerHTML = `<span class="status-dot warn"></span><span>Verificando estoque de contraprova em ${garagem}…</span>`;

  try {
    const info = await verificarEstoqueContraprova(garagem);
    estoqueContraprovaAtual = { garagem, disponivel: info.disponivel };
    if (info.disponivel > 0) {
      banner.className = "banner ok";
      banner.innerHTML = `<span class="status-dot ok"></span><span>Estoque de contraprova em ${garagem}: <strong>${info.disponivel} disponível(is)</strong> (${info.usado}/${info.alocado} usados).</span>`;
    } else {
      banner.className = "banner error";
      banner.innerHTML = `<span class="status-dot error"></span><span>Sem testes de contraprova disponíveis em ${garagem}. Avise o ADM pra alocar mais antes de continuar.</span>`;
    }
  } catch (e) {
    banner.className = "banner error";
    banner.innerHTML = `<span class="status-dot error"></span><span>Erro ao verificar estoque: ${e.message}</span>`;
    estoqueContraprovaAtual = null;
  }
  validarFormularioTeste();
}

function marcarEncaminhadoGestor(matricula) {
  const entrada = retestesPendentes.find(r => r.matricula === matricula);
  if (entrada) {
    entrada.encaminhadoGestor = true;
    salvarRetestesPendentesLS();
    renderRetestes();
  }
}

function removerRetestePendente(matricula) {
  retestesPendentes = retestesPendentes.filter(r => r.matricula !== matricula);
  salvarRetestesPendentesLS();
  renderRetestes();
}

/* ---------------------------------------------------------- */
/* HISTÓRICO DO MOTORISTA (últimos 5 testes, todas as regionais)*/
/* ---------------------------------------------------------- */

async function buscarHistoricoMotorista(matricula) {
  const sheets = [
    { base: "SAO", nome: APP_CONFIG.bases.SAO },
    { base: "RIO", nome: APP_CONFIG.bases.RIO },
    { base: "SUL", nome: APP_CONFIG.bases.SUL }
  ];

  const resultados = await Promise.all(
    sheets.map(s => Sheets.getValues(`${s.nome}!A2:K`).catch(() => []))
  );

  const registros = [];
  resultados.forEach((rows, i) => {
    rows.forEach(r => {
      const motoristaTexto = r[4] || "";
      if (motoristaTexto.includes(`mat. ${matricula}`)) {
        registros.push({
          base: sheets[i].base,
          data: parseDataHoraBR(r[0]),
          dataTexto: r[0],
          resultado: r[6] || "",
          tentativa: r[9] || "1"
        });
      }
    });
  });

  registros.sort((a, b) => (b.data?.getTime() || 0) - (a.data?.getTime() || 0));
  return registros.slice(0, 5);
}

function renderHistoricoMotorista(registros) {
  const box = $("historicoMotorista");
  const bloco = $("blocoHistorico");

  if (!registros.length) {
    box.innerHTML = '<div class="historico-empty">Nenhum teste anterior encontrado.</div>';
  } else {
    box.innerHTML = "";
    registros.forEach(reg => {
      const pass = reg.resultado === "Negativo" || reg.resultado === "Aprovado"; // compatível com registros antigos
      const div = document.createElement("div");
      div.className = "historico-item";
      const tentativaTexto = reg.tentativa === "CP" ? " · contraprova" : (reg.tentativa > 1 ? ` · tentativa ${reg.tentativa}` : "");
      div.innerHTML = `
        <span class="data">${reg.dataTexto} · ${reg.base}</span>
        <span class="pill ${pass ? "ok" : "error"}">${reg.resultado}${tentativaTexto}</span>`;
      box.appendChild(div);
    });
  }
  bloco.classList.remove("hidden");
}

/* ---------------------------------------------------------- */
/* BOOT                                                         */
/* ---------------------------------------------------------- */

async function boot() {
  const raw = sessionStorage.getItem("baf_perfil");
  if (!raw) { window.location.href = "index.html"; return; }
  PERFIL = JSON.parse(raw);

  try { FirebaseDB.init(); } catch (e) { console.warn(e); }

  $("userName").textContent = PERFIL.nome;
  $("userRole").textContent = PERFIL.role === "instrutor" ? "Instrutor JCA" : "Operação/Tráfego";
  $("userEmpresa").textContent = PERFIL.empresa;
  aplicarLogoEmpresa(PERFIL.empresa);
  aplicarAvatarGoogle();

  popularSelectEmpresas();
  await Promise.all([carregarMotoristas(), carregarEquipamentos()]);
  setupEventos();

  carregarRetestesPendentesLS();
  renderRetestes();
  setInterval(tickRetestes, 1000);

  // Atualiza a lista de equipamentos sozinha a cada 30s, sem precisar recarregar a página
  setInterval(() => atualizarEquipamentosAgora(false), 30000);

  if (Sheets.isMockMode()) {
    toast("Modo de teste ativo — os dados ficam salvos só neste navegador.");
  }
}

/* ---------------------------------------------------------- */
/* CARREGAMENTO DE DADOS                                        */
/* ---------------------------------------------------------- */

function popularSelectEmpresas() {
  const select = $("campoEmpresa");
  APP_CONFIG.empresas.forEach(empresa => {
    const opt = document.createElement("option");
    opt.value = empresa;
    opt.textContent = empresa;
    select.appendChild(opt);
  });
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

/** Filtra motoristas por nome ou matrícula (case-insensitive) */
function filtrarMotoristas(texto) {
  const termo = texto.trim().toLowerCase();
  if (!termo) return [];
  return MOTORISTAS.filter(m =>
    m.nome.toLowerCase().includes(termo) || String(m.matricula).includes(termo)
  ).slice(0, 8); // limita a 8 sugestões pra lista não ficar gigante
}

function renderSugestoesMotorista(lista) {
  const box = $("motoristaSugestoes");
  box.innerHTML = "";

  if (!lista.length) {
    box.classList.add("hidden");
    return;
  }

  lista.forEach(m => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    item.innerHTML = `${m.nome} <span class="mat">mat. ${m.matricula}</span>`;
    item.addEventListener("mousedown", (ev) => {
      ev.preventDefault(); // evita perder o foco antes do click completar
      selecionarMotorista(m);
    });
    box.appendChild(item);
  });

  box.classList.remove("hidden");
}

function selecionarMotorista(motorista) {
  $("campoMotorista").value = `${motorista.nome} — mat. ${motorista.matricula}`;
  motoristaAtual = motorista;
  $("motoristaInfo").textContent = `Empresa: ${motorista.empresa}${motorista.setor ? " · Setor: " + motorista.setor : ""}`;
  $("campoEmpresa").value = motorista.empresa;
  aoTrocarEmpresa();
  renderSugestoesMotorista([]);
  atualizarBannerReteste();
  validarFormularioTeste();

  buscarHistoricoMotorista(String(motorista.matricula))
    .then(renderHistoricoMotorista)
    .catch(() => renderHistoricoMotorista([]));
}

function aoDigitarMotorista() {
  const texto = $("campoMotorista").value;

  // Se o texto não corresponde mais ao motorista que estava selecionado, desfaz a seleção
  if (motoristaAtual && texto !== `${motoristaAtual.nome} — mat. ${motoristaAtual.matricula}`) {
    motoristaAtual = null;
    $("motoristaInfo").textContent = "";
    $("blocoHistorico").classList.add("hidden");
    atualizarBannerReteste();
  }

  renderSugestoesMotorista(filtrarMotoristas(texto));
  validarFormularioTeste();
}

function aoTrocarEmpresa() {
  const empresa = $("campoEmpresa").value;
  $("campoContrato").innerHTML = '<option value="">Selecione o contrato…</option>';
  $("campoGaragem").innerHTML = '<option value="">Selecione a garagem…</option>';
  if (empresa) carregarContratosEGaragens(empresa);
  atualizarListaEquipamentosDisponiveis();
  validarFormularioTeste();
}

async function carregarContratosEGaragens(empresa) {
  const [contratos, garagens] = await Promise.all([
    Sheets.getValues(`${APP_CONFIG.sheets.contratos}!A2:B`),
    Sheets.getValues(`${APP_CONFIG.sheets.recepcaoAtiva}!A2:B`)
  ]);

  const contratoSelect = $("campoContrato");
  contratoSelect.innerHTML = '<option value="">Selecione o contrato…</option>';
  contratos
    .filter(row => (row[0] || "").trim() === empresa)
    .forEach(row => {
      const opt = document.createElement("option");
      opt.value = row[1];
      opt.textContent = row[1];
      contratoSelect.appendChild(opt);
    });

  const garagemSelect = $("campoGaragem");
  garagemSelect.innerHTML = '<option value="">Selecione a garagem…</option>';
  garagens
    .filter(row => (row[0] || "").trim() === empresa)
    .forEach(row => {
      const opt = document.createElement("option");
      opt.value = row[1];
      opt.textContent = row[1];
      garagemSelect.appendChild(opt);
    });
}

async function carregarEquipamentos() {
  const [equipRows, manutRows] = await Promise.all([
    Sheets.getValues(`${APP_CONFIG.sheets.equipamentos}!A2:G`),
    Sheets.getValues(`${APP_CONFIG.sheets.manutencaoEquipamentos}!A2:G`)
  ]);

  // A Modelo | B Nº Série | C Data de Envio | D Data de Retorno | E Motivo Manutenção | F Baixa | G Registrado por
  MANUTENCOES = manutRows.map(r => ({
    serie: r[1], dataEnvio: r[2], dataRetorno: r[3], motivo: r[4], baixa: r[5], registradoPor: r[6]
  }));

  EQUIPAMENTOS = equipRows.map((r, i) => ({
    rowIndex: i + 2, // linha real na planilha (cabeçalho ocupa a linha 1)
    modelo: r[0], serie: r[1], afericao: r[2], validade: r[3],
    status: r[4] || "Ativo", dataBaixa: r[5] || "", garagem: r[6] || ""
  }));

  atualizarListaEquipamentosDisponiveis();
}

/** Equipamentos que a operação pode de fato usar: nem baixados, nem em
 *  manutenção aberta. Se uma garagem específica estiver selecionada
 *  (Local de Aplicação = Garagem), filtra só o equipamento daquela garagem. */
function equipamentosDisponiveis() {
  const tipo = $("campoLocalTipo") ? $("campoLocalTipo").value : "";
  const garagemSelecionada = $("campoGaragem") ? $("campoGaragem").value : "";

  return EQUIPAMENTOS.filter(e => {
    if (e.status === "Baixado") return false;
    // Só conta como manutenção aberta se a linha tiver motivo preenchido
    // (evita confundir com linhas que são só registro de "Baixa")
    const manutAberta = MANUTENCOES.find(m =>
      m.serie === e.serie && m.motivo && (!m.dataRetorno || m.dataRetorno.trim() === "")
    );
    if (manutAberta) return false;
    if (tipo === "GARAGEM" && garagemSelecionada) {
      return e.garagem === garagemSelecionada;
    }
    return true;
  });
}

function atualizarListaEquipamentosDisponiveis() {
  preencherSelectEquipamentos("campoEquipamento", equipamentosDisponiveis());
}

function preencherSelectEquipamentos(selectId, lista) {
  const select = $(selectId);
  const valorAnterior = select.value;

  select.innerHTML = '<option value="">Selecione o equipamento…</option>';
  lista.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.serie;
    opt.textContent = `${e.modelo} · Nº série ${e.serie}`;
    select.appendChild(opt);
  });

  if (valorAnterior) {
    const aindaDisponivel = lista.some(e => e.serie === valorAnterior);
    if (aindaDisponivel) {
      select.value = valorAnterior;
    } else {
      toast("O equipamento selecionado não está mais disponível — escolha outro.");
      atualizarBannerEquipamento();
      validarFormularioTeste();
    }
  }
}

/** Busca de novo os dados de equipamentos/manutenção no Sheets — usado tanto
 *  pelo botão manual quanto pela atualização automática periódica. */
async function atualizarEquipamentosAgora(manual) {
  const btn = $("btnAtualizarEquipamentos");
  const status = $("equipamentosAtualizadoEm");
  if (manual && btn) { btn.disabled = true; btn.textContent = "…"; }

  try {
    await carregarEquipamentos();
    if (status) {
      const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      status.textContent = `Lista atualizada às ${agora}.`;
    }
    if (manual) toast("Lista de equipamentos atualizada.");
  } catch (e) {
    if (Sheets.tratarErroSessao(e)) return;
    if (manual) toast("Não foi possível atualizar a lista: " + e.message);
  } finally {
    if (manual && btn) { btn.disabled = false; btn.textContent = "↻"; }
  }
}

/* ---------------------------------------------------------- */
/* VALIDAÇÃO DE EQUIPAMENTO                                     */
/* ---------------------------------------------------------- */

function statusDoEquipamento(serie) {
  const equip = EQUIPAMENTOS.find(e => e.serie === serie);
  if (!equip) return { ok: false, msg: "Equipamento não encontrado." };

  if (equip.status === "Baixado") {
    return { ok: false, msg: "Este equipamento está baixado e não pode ser utilizado." };
  }

  if (equip.validade) {
    const validade = parseDataEquipamento(equip.validade);
    if (validade && validade < new Date()) {
      return { ok: false, msg: "Equipamento Vencido. Procure um responsável do setor Operacional." };
    }
  }

  const manutencaoAberta = MANUTENCOES.find(
    m => m.serie === serie && m.motivo && (!m.dataRetorno || m.dataRetorno.trim() === "")
  );
  if (manutencaoAberta) {
    return {
      ok: false,
      msg: `Equipamento em manutenção (${manutencaoAberta.motivo}) sem data de retorno registrada. Indisponível para uso.`
    };
  }

  return { ok: true, equip };
}

function atualizarBannerEquipamento() {
  const serie = $("campoEquipamento").value;
  const banner = $("bannerEquipamento");
  const btnSubmit = $("btnRegistrarTeste");

  if (!serie) {
    banner.className = "banner hidden";
    btnSubmit.disabled = true;
    return;
  }

  const check = statusDoEquipamento(serie);
  if (!check.ok) {
    banner.className = "banner error";
    banner.innerHTML = `<span class="status-dot error"></span><span>${check.msg}</span>`;
    btnSubmit.disabled = true;
  } else {
    banner.className = "banner ok";
    banner.innerHTML = `<span class="status-dot ok"></span><span>Equipamento apto — aferição em ${formatarData(check.equip.afericao)}, válido até ${formatarData(check.equip.validade)}.</span>`;
    validarFormularioTeste();
  }
}

function formatarData(str) {
  const d = parseDataEquipamento(str);
  if (!d) return str || "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/* ---------------------------------------------------------- */
/* FORMULÁRIO: APLICAR TESTE                                    */
/* ---------------------------------------------------------- */

function aoTrocarLocalTipo() {
  const tipo = $("campoLocalTipo").value;
  $("blocoContrato").classList.toggle("hidden", tipo !== "CONTRATO");
  $("blocoGaragem").classList.toggle("hidden", tipo !== "GARAGEM");
  atualizarListaEquipamentosDisponiveis();
  reavaliarEstoqueSeContraprova();
  validarFormularioTeste();
}

function aoTrocarGaragem() {
  atualizarListaEquipamentosDisponiveis();
  reavaliarEstoqueSeContraprova();
  validarFormularioTeste();
}

function reavaliarEstoqueSeContraprova() {
  const pendente = retestePendenteDoMotoristaAtual();
  atualizarBlocoEvidencia(pendente);
}

/** Valor final que vai pra coluna D (Contrato) da planilha — depende do tipo escolhido */
function valorLocalAplicacao() {
  const tipo = $("campoLocalTipo").value;
  if (tipo === "GARAGEM") return $("campoGaragem").value;
  if (tipo === "CONTRATO") return $("campoContrato").value;
  return "";
}

/** Valida o padrão 0.00 — um dígito, ponto, dois dígitos */
function resultadoNumericoValido() {
  if (resultadoSelecionado === "Negativo") return true; // preenchido automaticamente com 0.00
  return /^\d\.\d{2}$/.test($("campoResultadoNumerico").value.trim());
}

/** Mostra/esconde o campo numérico conforme Negativo ou Positivo */
function aoTrocarResultado() {
  const bloco = $("blocoResultadoNumerico");
  const campo = $("campoResultadoNumerico");

  if (resultadoSelecionado === "Negativo") {
    campo.value = "0.00";
    $("resultadoNumericoErro").textContent = "";
    bloco.classList.add("hidden");
  } else if (resultadoSelecionado === "Positivo") {
    campo.value = "";
    bloco.classList.remove("hidden");
  }
}

function aoDigitarResultadoNumerico() {
  const valor = $("campoResultadoNumerico").value.trim();
  const erro = $("resultadoNumericoErro");
  erro.textContent = (valor && !resultadoNumericoValido()) ? "Formato inválido — use o padrão 0.00 (ex: 0.35)." : "";
  validarFormularioTeste();
}

function validarFormularioTeste() {
  const pendente = retestePendenteDoMotoristaAtual();
  const ehContraprovaAgora = pendente && pendente.contraprova && !pendente.encaminhadoGestor;

  const serie = $("campoEquipamento").value;
  const equipOk = ehContraprovaAgora || (serie && statusDoEquipamento(serie).ok);
  const localOk = valorLocalAplicacao() !== "";

  const bloqueadoDefinitivo = pendente && pendente.encaminhadoGestor;
  const aguardandoReteste = pendente && !pendente.contraprova && (pendente.expiraEm - Date.now()) > 0;
  const evidenciaOk = !ehContraprovaAgora || ($("campoEvidenciaContraprova").files && $("campoEvidenciaContraprova").files.length > 0);
  const estoqueOk = !ehContraprovaAgora || (
    estoqueContraprovaAtual &&
    estoqueContraprovaAtual.garagem === $("campoGaragem").value &&
    estoqueContraprovaAtual.disponivel > 0
  );

  const camposOk = motoristaAtual && $("campoEmpresa").value && $("campoBase").value &&
    $("campoLocalTipo").value && localOk && resultadoSelecionado && resultadoNumericoValido() &&
    !aguardandoReteste && !bloqueadoDefinitivo && evidenciaOk && estoqueOk;
  $("btnRegistrarTeste").disabled = !(equipOk && camposOk);
}

function setupEventos() {
  ["campoBase", "campoContrato"].forEach(id => {
    $(id).addEventListener("change", validarFormularioTeste);
  });
  $("campoGaragem").addEventListener("change", aoTrocarGaragem);
  $("campoLocalTipo").addEventListener("change", aoTrocarLocalTipo);
  $("campoMotorista").addEventListener("input", aoDigitarMotorista);
  $("campoMotorista").addEventListener("blur", () => {
    // pequeno atraso pra permitir que o click no item (mousedown) complete antes de esconder
    setTimeout(() => renderSugestoesMotorista([]), 150);
  });
  $("campoEmpresa").addEventListener("change", aoTrocarEmpresa);
  $("campoEquipamento").addEventListener("change", atualizarBannerEquipamento);
  $("btnAtualizarEquipamentos").addEventListener("click", () => atualizarEquipamentosAgora(true));
  $("campoResultadoNumerico").addEventListener("input", aoDigitarResultadoNumerico);
  $("campoEvidenciaContraprova").addEventListener("change", validarFormularioTeste);

  document.querySelectorAll(".result-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".result-btn").forEach(b => b.classList.remove("selected", "pass", "fail"));
      resultadoSelecionado = btn.dataset.result;
      btn.classList.add("selected", resultadoSelecionado === "Negativo" ? "pass" : "fail");
      aoTrocarResultado();
      validarFormularioTeste();
    });
  });

  $("formTeste").addEventListener("submit", registrarTeste);

  $("btnSair").addEventListener("click", async () => {
    await Auth.signOut();
    window.location.href = "index.html";
  });
}

async function registrarTeste(ev) {
  ev.preventDefault();
  const btn = $("btnRegistrarTeste");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Registrando…';

  const base = $("campoBase").value; // "SAO" | "RIO" | "SUL"
  const sheetName = APP_CONFIG.bases[base];
  const resultadoNumerico = $("campoResultadoNumerico").value.trim();
  const equipSelecionado = EQUIPAMENTOS.find(e => e.serie === $("campoEquipamento").value);
  const pendente = retestePendenteDoMotoristaAtual();
  const ehContraprovaAgora = pendente && pendente.contraprova && !pendente.encaminhadoGestor;
  const tentativaAtual = ehContraprovaAgora ? "CP" : (pendente ? pendente.tentativa + 1 : 1);

  // Contraprova exige o upload da evidência ANTES de gravar o teste
  let linkEvidencia = "";
  if (ehContraprovaAgora) {
    const arquivo = $("campoEvidenciaContraprova").files[0];
    if (!arquivo) {
      toast("Anexe a evidência da contraprova antes de registrar.");
      btn.disabled = false;
      btn.textContent = "Registrar Teste";
      return;
    }
    try {
      btn.innerHTML = '<span class="spinner"></span> Subindo evidência…';
      const extensao = (arquivo.name && arquivo.name.includes(".")) ? arquivo.name.split(".").pop() : "jpg";
      const nomeArquivo = `contraprova-${motoristaAtual.matricula}-${hojeISO()}-${Date.now()}.${extensao}`;
      const resultadoUpload = await Drive.uploadArquivo(arquivo, nomeArquivo);
      linkEvidencia = resultadoUpload.webViewLink || "";
    } catch (e) {
      if (Sheets.tratarErroSessao(e)) return;
      toast("Erro ao subir a evidência pro Drive: " + e.message);
      btn.disabled = false;
      btn.textContent = "Registrar Teste";
      return;
    }
    btn.innerHTML = '<span class="spinner"></span> Registrando…';
  }

  const teste = {
    dataHora: dataHoraBR(),
    empresa: $("campoEmpresa").value,
    aplicador: PERFIL.nome,
    contrato: valorLocalAplicacao(), // vai pra coluna D — garagem ou contrato, conforme o "Local de Aplicação"
    localTipo: $("campoLocalTipo").value, // "GARAGEM" | "CONTRATO" — guardado só no Firebase, referência interna
    motorista: $("campoMotorista").value.trim(),
    setor: motoristaAtual?.setor || "",
    resultado: resultadoSelecionado,
    resultadoNumerico,
    equipamentoSerie: $("campoEquipamento").value,
    equipamentoDescricao: ehContraprovaAgora ? "Kit Contraprova (descartável)" : (equipSelecionado ? `${equipSelecionado.modelo} · Nº ${equipSelecionado.serie}` : $("campoEquipamento").value),
    tentativa: tentativaAtual,
    linkEvidencia
  };

  let firebaseDocId = null;
  try {
    firebaseDocId = await FirebaseDB.salvarTeste(base, teste);
  } catch (e) {
    console.warn("Falha ao gravar no Firebase (seguindo para o Sheets mesmo assim):", e);
  }

  try {
    // A Data/Hora B Empresa C Aplicador D Contrato/Local E Motorista F Setor
    // G Resultado H Resultado(mg/L) I Equipamento J Tentativa do dia K Link Evidência Contraprova
    await Sheets.appendRow(sheetName, [
      teste.dataHora, teste.empresa, teste.aplicador, teste.contrato, teste.motorista,
      teste.setor, teste.resultado, teste.resultadoNumerico, teste.equipamentoDescricao, teste.tentativa, teste.linkEvidencia
    ]);
    if (firebaseDocId) await FirebaseDB.marcarSincronizado(firebaseDocId).catch(() => {});

    if (teste.resultado === "Positivo") {
      if (ehContraprovaAgora) {
        marcarEncaminhadoGestor(String(motoristaAtual.matricula));
        toast(`Contraprova positiva — encaminhar ${teste.motorista} para o GESTOR.`);
      } else {
        iniciarOuAvancarTimerReteste({
          motorista: teste.motorista, matricula: String(motoristaAtual.matricula), empresa: teste.empresa,
          tentativaConcluida: tentativaAtual
        });
        const entrada = retestePendenteDoMotoristaAtual();
        if (entrada?.contraprova) {
          toast(`3ª tentativa positiva — encaminhar ${teste.motorista} para CONTRAPROVA.`);
        } else {
          toast(`Teste registrado. Reteste (tentativa ${tentativaAtual + 1}/3) liberado em ${RETESTE_MINUTOS} min.`);
        }
      }
    } else {
      if (pendente) removerRetestePendente(pendente.matricula); // negativo (mesmo na contraprova) encerra a cadeia
      toast("Teste registrado com sucesso.");
    }

    mostrarResultadoFinal(teste);
    resetarFormularioTeste();
  } catch (e) {
    if (Sheets.tratarErroSessao(e)) return;
    toast("Teste salvo localmente, mas houve erro ao gravar na planilha: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Registrar Teste";
  }
}

function mostrarResultadoFinal(teste) {
  const gauge = $("resultGauge");
  const pass = teste.resultado === "Negativo";
  gauge.className = "result-gauge " + (pass ? "pass" : "fail");
  gauge.querySelector("span").textContent = teste.resultado.toUpperCase();
  $("resultCard").style.display = "block";
  $("resultDriver").textContent = teste.motorista;
  $("resultTime").textContent = teste.dataHora;
}

function resetarFormularioTeste() {
  $("campoMotorista").value = "";
  $("motoristaInfo").textContent = "";
  motoristaAtual = null;
  $("campoEmpresa").value = "";
  $("campoBase").value = "";
  $("campoLocalTipo").value = "";
  $("blocoContrato").classList.add("hidden");
  $("blocoGaragem").classList.add("hidden");
  $("campoContrato").innerHTML = '<option value="">Selecione o contrato…</option>';
  $("campoGaragem").innerHTML = '<option value="">Selecione a garagem…</option>';
  $("campoEquipamento").value = "";
  $("campoResultadoNumerico").value = "";
  $("resultadoNumericoErro").textContent = "";
  $("blocoResultadoNumerico").classList.add("hidden");
  $("campoEvidenciaContraprova").value = "";
  $("blocoEvidenciaContraprova").classList.add("hidden");
  $("bannerEstoqueContraprova").className = "banner hidden";
  estoqueContraprovaAtual = null;
  $("blocoHistorico").classList.add("hidden");
  $("bannerReteste").className = "banner hidden";
  document.querySelectorAll(".result-btn").forEach(b => b.classList.remove("selected", "pass", "fail"));
  resultadoSelecionado = null;
  $("bannerEquipamento").className = "banner hidden";
  $("btnRegistrarTeste").disabled = true;
}

boot();