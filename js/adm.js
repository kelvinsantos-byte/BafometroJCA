/**
 * ============================================================
 *  ADM.JS — Portal administrativo (cadastro de equipamentos e usuários)
 *  Acesso restrito a e-mails cadastrados na aba ADM.
 * ============================================================
 */

let PERFIL = null;
let EQUIPAMENTOS = []; // [{rowIndex, modelo, serie, afericao, validade, status, garagem}]
let MANUTENCOES = [];  // [{rowIndex, modelo, serie, dataEnvio, dataRetorno, motivo, baixa, registradoPor}]
let GARAGENS = [];     // [{empresa, garagem}]
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

/** Converte data de equipamento pra Date, aceitando "yyyy-mm-dd" (ISO) ou
 *  "dd/mm/yyyy" (formato que o Sheets costuma devolver pra células de data) */
function parseDataEquipamento(str) {
  if (!str) return null;
  const iso = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], 23, 59, 59);
  const br = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1], 23, 59, 59);
  return null;
}

function formatarData(str) {
  const d = parseDataEquipamento(str);
  if (!d) return str || "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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

async function boot() {
  const raw = sessionStorage.getItem("baf_perfil");
  if (!raw) { window.location.href = "index.html"; return; }
  PERFIL = JSON.parse(raw);

  if (PERFIL.role !== "adm") {
    alert("Acesso restrito a administradores.");
    window.location.href = "index.html";
    return;
  }

  try { FirebaseDB.init(); } catch (e) { console.warn(e); }

  $("userName").textContent = PERFIL.nome;
  $("userEmpresa").textContent = PERFIL.empresa;
  aplicarLogoEmpresa(PERFIL.empresa);
  $("usEmpresa").value = PERFIL.empresa;
  aplicarAvatarGoogle();

  setupTabs();
  setupEventos();
  await carregarGaragens();
  await carregarFornecedoresParaOcorrencia();
  await Promise.all([carregarEquipamentos(), carregarUsuarios()]);

  if (Sheets.isMockMode()) {
    toast("Modo de teste ativo — os dados ficam salvos só neste navegador.");
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
      $(tab.dataset.panel).style.display = "block";
    });
  });
}

function setupEventos() {
  $("formEquipamento").addEventListener("submit", cadastrarEquipamento);
  $("formUsuario").addEventListener("submit", cadastrarUsuario);
  $("formOcorrencia").addEventListener("submit", registrarOcorrencia);
  $("campoMotivoOcorrencia").addEventListener("change", (e) => {
    const isManutencao = e.target.value === "Manutenção";
    $("blocoMotivoManutencao").style.display = isManutencao ? "block" : "none";
    $("blocoFornecedorManutencao").style.display = isManutencao ? "block" : "none";
  });
  $("filtroGaragemEstoque").addEventListener("change", renderListaEquipamentos);
  $("btnSair").addEventListener("click", async () => {
    await Auth.signOut();
    window.location.href = "index.html";
  });
}

async function carregarGaragens() {
  const rows = await Sheets.getValues(`${APP_CONFIG.sheets.recepcaoAtiva}!A2:B`);
  GARAGENS = rows
    .map(r => ({ empresa: r[0] || "", garagem: r[1] || "" }))
    .filter(g => g.garagem && g.empresa === PERFIL.empresa); // só as garagens da empresa desse ADM

  const eqSelect = $("eqGaragem");
  const filtroSelect = $("filtroGaragemEstoque");
  eqSelect.innerHTML = '<option value="">Selecione a garagem…</option>';
  GARAGENS.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.garagem;
    opt.textContent = `${g.garagem} (${g.empresa})`;
    eqSelect.appendChild(opt);

    const opt2 = document.createElement("option");
    opt2.value = g.garagem;
    opt2.textContent = `${g.garagem} (${g.empresa})`;
    filtroSelect.appendChild(opt2);
  });
}

let FORNECEDORES = [];

async function carregarFornecedoresParaOcorrencia() {
  const rows = await Sheets.getValues(`${APP_CONFIG.sheets.fornecedores}!A2:E`);
  FORNECEDORES = rows
    .map(r => ({ nome: r[0] || "", cnpj: r[1] || "", endereco: r[2] || "", empresa: r[3] || "", regional: r[4] || "" }))
    .filter(f => f.nome && f.empresa === PERFIL.empresa); // só fornecedores da empresa desse ADM

  const select = $("campoFornecedorManutencao");
  if (!select) return;
  select.innerHTML = '<option value="">Selecione o fornecedor…</option>';
  FORNECEDORES.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.nome;
    opt.textContent = `${f.nome} (${f.regional})`;
    select.appendChild(opt);
  });
}

/* ---------------------------------------------------------- */
/* CADASTRAR EQUIPAMENTO -> aba CONTROLE DE EQUIPAMENTOS        */
/* ---------------------------------------------------------- */

async function cadastrarEquipamento(ev) {
  ev.preventDefault();

  const equipamento = {
    modelo: $("eqModelo").value.trim(),
    serie: $("eqSerie").value.trim(),
    garagem: $("eqGaragem").value,
    afericao: $("eqAfericao").value,
    validade: $("eqValidade").value
  };

  const jaExiste = EQUIPAMENTOS.some(
    e => e.serie.trim().toLowerCase() === equipamento.serie.toLowerCase()
  );
  if (jaExiste) {
    toast(`Já existe um equipamento cadastrado com o número de série "${equipamento.serie}". Use um número diferente.`);
    $("eqSerie").focus();
    return;
  }

  const btn = $("btnCadastrarEquip");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    await FirebaseDB.salvarEquipamento(equipamento).catch(e => console.warn("Firebase:", e));
    // A Modelo | B Nº Série | C Aferição | D Validade | E Status | F Data de Baixa | G Garagem | H Empresa
    await Sheets.appendRow(APP_CONFIG.sheets.equipamentos, [
      equipamento.modelo, equipamento.serie, equipamento.afericao, equipamento.validade, "Ativo", "", equipamento.garagem, PERFIL.empresa
    ]);
    toast("Equipamento cadastrado com sucesso.");
    $("formEquipamento").reset();
    await carregarEquipamentos();
  } catch (e) {
    if (Sheets.tratarErroSessao(e)) return;
    toast("Erro ao cadastrar equipamento: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Cadastrar Equipamento";
  }
}

async function carregarEquipamentos() {
  const [equipRows, manutRows] = await Promise.all([
    Sheets.getValues(`${APP_CONFIG.sheets.equipamentos}!A2:H`),
    Sheets.getValues(`${APP_CONFIG.sheets.manutencaoEquipamentos}!A2:H`)
  ]);

  // A Modelo | B Nº Série | C Data de Envio | D Data de Retorno | E Motivo Manutenção | F Baixa | G Registrado por | H Fornecedor
  MANUTENCOES = manutRows.map((r, i) => ({
    rowIndex: i + 2,
    modelo: r[0], serie: r[1], dataEnvio: r[2], dataRetorno: r[3],
    motivo: r[4], baixa: r[5], registradoPor: r[6], fornecedor: r[7] || ""
  }));

  // A Modelo | B Nº Série | C Aferição | D Validade | E Status | F Data de Baixa | G Garagem | H Empresa
  // Só entram equipamentos da MESMA empresa do ADM logado — isolamento por domínio.
  EQUIPAMENTOS = equipRows
    .map((r, i) => ({
      rowIndex: i + 2, // linha real na planilha (cabeçalho ocupa a linha 1)
      modelo: r[0], serie: r[1], afericao: r[2], validade: r[3],
      status: r[4] || "Ativo", dataBaixa: r[5] || "", garagem: r[6] || "", empresa: r[7] || ""
    }))
    .filter(e => e.empresa === PERFIL.empresa);

  renderListaEquipamentos();

  const ocorrenciaSelect = $("campoEquipamentoOcorrencia");
  ocorrenciaSelect.innerHTML = '<option value="">Selecione o equipamento…</option>';
  EQUIPAMENTOS
    .filter(e => e.status !== "Baixado" && !manutencaoAbertaDoEquipamento(e.serie))
    .forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.serie;
      opt.textContent = `${e.modelo} · Nº série ${e.serie}`;
      ocorrenciaSelect.appendChild(opt);
    });
}

/** Só conta como "manutenção aberta" se a linha for de fato um registro de
 *  manutenção (tem motivo preenchido) sem data de retorno — isso evita
 *  confundir com linhas de "Baixa" (que não têm motivo/retorno mesmo). */
function manutencaoAbertaDoEquipamento(serie) {
  return MANUTENCOES.find(m =>
    m.serie === serie && m.motivo && (!m.dataRetorno || m.dataRetorno.trim() === "")
  );
}

function situacaoEquipamento(equip) {
  if (equip.status === "Baixado") return { classe: "error", texto: "Baixado" };
  if (manutencaoAbertaDoEquipamento(equip.serie)) return { classe: "warn", texto: "Em Manutenção" };
  const vencido = equip.validade && parseDataEquipamento(equip.validade) && parseDataEquipamento(equip.validade) < new Date();
  if (vencido) return { classe: "warn", texto: "Vencido" };
  return { classe: "ok", texto: "Ativo" };
}

function renderListaEquipamentos() {
  const filtroGaragem = $("filtroGaragemEstoque").value;
  const list = $("listaEquipamentos");
  list.innerHTML = "";

  const equipamentosFiltrados = EQUIPAMENTOS
    .filter(e => {
      if (!filtroGaragem) return true;
      if (filtroGaragem === "__ESTOQUE__") return !e.garagem;
      return e.garagem === filtroGaragem;
    })
    .slice().reverse();

  if (!equipamentosFiltrados.length) {
    list.innerHTML = '<div class="empty-state">Nenhum equipamento encontrado com esse filtro.</div>';
    return;
  }

  equipamentosFiltrados.forEach(equip => {
    const sit = situacaoEquipamento(equip);
    const row = document.createElement("div");
    row.className = "list-row";
    row.style.cursor = "pointer";
    row.innerHTML = `
      <div>
        <div>${equip.modelo}</div>
        <div class="muted mono">Nº ${equip.serie} · válido até ${equip.validade || "—"}</div>
        <div class="muted" style="font-size:11px;">${equip.garagem ? "📍 " + equip.garagem : "📦 Em estoque (sem garagem)"}</div>
      </div>
      <span class="pill ${sit.classe}">${sit.texto}</span>`;
    row.addEventListener("click", () => abrirModalEquipamento(equip.serie));
    list.appendChild(row);
  });
}

/* ---------------------------------------------------------- */
/* REPORTAR OCORRÊNCIA (manutenção / baixa de equipamento)      */
/* ---------------------------------------------------------- */

async function registrarOcorrencia(ev) {
  ev.preventDefault();
  const serie = $("campoEquipamentoOcorrencia").value;
  const motivo = $("campoMotivoOcorrencia").value;
  if (!serie || !motivo) return;

  const equip = EQUIPAMENTOS.find(e => e.serie === serie);
  if (!equip) { toast("Equipamento não encontrado."); return; }

  const btn = $("btnRegistrarOcorrencia");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Enviando…';

  // Colunas da aba MANUTENÇÃO EQUIPAMENTOS:
  // A Modelo | B Nº Série | C Data de Envio | D Data de Retorno | E Motivo Manutenção | F Baixa | G Registrado por
  try {
    if (motivo === "Baixa de Equipamento") {
      // Atualiza colunas E (Status) e F (Data de Baixa) da linha do equipamento em CONTROLE DE EQUIPAMENTOS
      await Sheets.updateRange(
        `${APP_CONFIG.sheets.equipamentos}!E${equip.rowIndex}:F${equip.rowIndex}`,
        ["Baixado", hojeISO()]
      );
      // Registra também na aba MANUTENÇÃO EQUIPAMENTOS, como histórico unificado
      await Sheets.appendRow(APP_CONFIG.sheets.manutencaoEquipamentos, [
        equip.modelo, serie, "", "", "", hojeISO(), PERFIL.nome
      ]);
      await FirebaseDB.salvarOcorrenciaEquipamento({
        serie, tipo: "Baixa", registradoPor: PERFIL.nome, dataBaixa: hojeISO()
      }).catch(() => {});
      toast(`Equipamento ${serie} baixado com sucesso.`);
    } else {
      const motivoManutencao = $("campoMotivoManutencao").value;
      const fornecedor = $("campoFornecedorManutencao").value;
      await Sheets.appendRow(APP_CONFIG.sheets.manutencaoEquipamentos, [
        equip.modelo, serie, hojeISO(), "", motivoManutencao, "", PERFIL.nome, fornecedor
      ]);
      await FirebaseDB.salvarOcorrenciaEquipamento({
        serie, tipo: "Manutenção", motivo: motivoManutencao, fornecedor, registradoPor: PERFIL.nome, dataEnvio: hojeISO()
      }).catch(() => {});
      toast(`Equipamento ${serie} enviado para manutenção (${motivoManutencao}).`);
    }
    await carregarEquipamentos();
    $("formOcorrencia").reset();
    $("blocoMotivoManutencao").style.display = "none";
    $("blocoFornecedorManutencao").style.display = "none";
  } catch (e) {
    if (Sheets.tratarErroSessao(e)) return;
    toast("Erro ao registrar ocorrência: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Registrar Ocorrência";
  }
}

/* ---------------------------------------------------------- */
/* MODAL: DETALHE DO EQUIPAMENTO / RETORNO DE MANUTENÇÃO         */
/* ---------------------------------------------------------- */

function abrirModalEquipamento(serie) {
  const equip = EQUIPAMENTOS.find(e => e.serie === serie);
  if (!equip) return;

  const sit = situacaoEquipamento(equip);
  const manutAberta = manutencaoAbertaDoEquipamento(serie);
  const historico = MANUTENCOES.filter(m => m.serie === serie).slice().reverse();

  $("modalEquipTitle").textContent = `${equip.modelo} · Nº ${equip.serie}`;

  let html = `
    <div class="detalhe-linha"><span class="label">Status</span><span class="valor"><span class="pill ${sit.classe}">${sit.texto}</span></span></div>
    <div class="detalhe-linha"><span class="label">Garagem</span><span class="valor">${equip.garagem || "—"}</span></div>
    <div class="detalhe-linha"><span class="label">Aferição atual</span><span class="valor">${formatarData(equip.afericao)}</span></div>
    <div class="detalhe-linha"><span class="label">Validade atual</span><span class="valor">${formatarData(equip.validade)}</span></div>
  `;

  if (equip.status === "Baixado") {
    html += `<div class="detalhe-linha"><span class="label">Data de baixa</span><span class="valor">${formatarData(equip.dataBaixa)}</span></div>`;
  }

  if (equip.status !== "Baixado") {
    html += `
      <h2 style="margin-top:6px;">${equip.garagem ? "Transferir para outra garagem" : "Vincular a uma garagem"}</h2>
      <div class="field">
        <label>Garagem</label>
        <select id="modalGaragemSelecionada">
          <option value="">📦 Deixar em estoque (sem garagem)</option>
        </select>
      </div>
      <button type="button" class="btn secondary" id="btnSalvarGaragem">Salvar Garagem</button>
    `;
  }

  html += `<h2 style="margin-top:6px;">Histórico de ocorrências</h2>`;
  if (!historico.length) {
    html += `<div class="empty-state">Nenhuma ocorrência registrada pra esse equipamento.</div>`;
  } else {
    historico.forEach(m => {
      if (m.baixa) {
        html += `
          <div class="detalhe-linha" style="flex-direction:column; align-items:flex-start; gap:3px;">
            <span class="valor" style="text-align:left;">Baixa de equipamento — ${formatarData(m.baixa)}</span>
            <span class="label" style="font-size:0.75rem;">Por: ${m.registradoPor || "—"}</span>
          </div>`;
      } else {
        const aberta = !m.dataRetorno || m.dataRetorno.trim() === "";
        html += `
          <div class="detalhe-linha" style="flex-direction:column; align-items:flex-start; gap:3px;">
            <span class="valor" style="text-align:left;">${m.motivo} — enviado em ${formatarData(m.dataEnvio)}</span>
            <span class="label" style="font-size:0.75rem;">Por: ${m.registradoPor || "—"}${m.fornecedor ? " · Fornecedor: " + m.fornecedor : ""} · ${aberta ? "ainda em aberto" : "retornou em " + formatarData(m.dataRetorno)}</span>
          </div>`;
      }
    });
  }

  if (manutAberta) {
    html += `
      <h2 style="margin-top:10px;">Registrar retorno do equipamento</h2>
      <div class="field">
        <label>Nova aferição</label>
        <input type="date" id="retornoAfericao" required>
      </div>
      <div class="field">
        <label>Nova validade</label>
        <input type="date" id="retornoValidade" required>
      </div>
      <button type="button" class="btn" id="btnConfirmarRetorno">Confirmar Retorno</button>
    `;
  }

  $("modalEquipBody").innerHTML = html;
  $("modalEquipamento").classList.add("open");

  if (manutAberta) {
    $("btnConfirmarRetorno").addEventListener("click", () => registrarRetornoEquipamento(equip, manutAberta));
  }

  if (equip.status !== "Baixado") {
    const garagemSelect = $("modalGaragemSelecionada");
    GARAGENS.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.garagem;
      opt.textContent = `${g.garagem} (${g.empresa})`;
      if (g.garagem === equip.garagem) opt.selected = true;
      garagemSelect.appendChild(opt);
    });
    $("btnSalvarGaragem").addEventListener("click", () => salvarGaragemEquipamento(equip));
  }
}

async function salvarGaragemEquipamento(equip) {
  const novaGaragem = $("modalGaragemSelecionada").value;
  const btn = $("btnSalvarGaragem");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    // Atualiza coluna G (Garagem) da linha do equipamento
    await Sheets.updateRange(
      `${APP_CONFIG.sheets.equipamentos}!G${equip.rowIndex}`,
      [novaGaragem]
    );
    toast(novaGaragem
      ? `Equipamento ${equip.serie} vinculado à garagem ${novaGaragem}.`
      : `Equipamento ${equip.serie} movido para o estoque.`);
    fecharModalEquipamento();
    await carregarEquipamentos();
  } catch (e) {
    if (Sheets.tratarErroSessao(e)) return;
    toast("Erro ao salvar a garagem: " + e.message);
    btn.disabled = false;
    btn.textContent = "Salvar Garagem";
  }
}

function fecharModalEquipamento() {
  $("modalEquipamento").classList.remove("open");
}

async function registrarRetornoEquipamento(equip, manutencao) {
  const novaAfericao = $("retornoAfericao").value;
  const novaValidade = $("retornoValidade").value;
  if (!novaAfericao || !novaValidade) {
    toast("Preencha as duas datas pra confirmar o retorno.");
    return;
  }

  const btn = $("btnConfirmarRetorno");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Confirmando…';

  try {
    // Atualiza colunas C (Aferição) e D (Validade) da linha do equipamento
    await Sheets.updateRange(
      `${APP_CONFIG.sheets.equipamentos}!C${equip.rowIndex}:D${equip.rowIndex}`,
      [novaAfericao, novaValidade]
    );
    // Fecha o registro de manutenção, preenchendo a Data de Retorno (coluna D)
    await Sheets.updateRange(
      `${APP_CONFIG.sheets.manutencaoEquipamentos}!D${manutencao.rowIndex}`,
      [hojeISO()]
    );
    toast(`Equipamento ${equip.serie} disponível novamente para a operação.`);
    fecharModalEquipamento();
    await carregarEquipamentos();
  } catch (e) {
    if (Sheets.tratarErroSessao(e)) return;
    toast("Erro ao registrar o retorno: " + e.message);
    btn.disabled = false;
    btn.textContent = "Confirmar Retorno";
  }
}

window.fecharModalEquipamento = fecharModalEquipamento;

/* ---------------------------------------------------------- */
/* CADASTRAR USUÁRIO -> aba OPERAÇÃO / TRÁFEGO                  */
/* ---------------------------------------------------------- */

async function cadastrarUsuario(ev) {
  ev.preventDefault();
  const btn = $("btnCadastrarUsuario");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  const usuario = {
    matricula: $("usMatricula").value.trim(),
    nome: $("usNome").value.trim(),
    empresa: PERFIL.empresa,
    email: $("usEmail").value.trim().toLowerCase()
  };

  if (!Auth.isDomainAllowed(usuario.email)) {
    toast("O e-mail precisa pertencer a um domínio corporativo do Grupo JCA.");
    btn.disabled = false;
    btn.textContent = "Cadastrar Usuário";
    return;
  }

  try {
    await FirebaseDB.salvarUsuario(usuario).catch(e => console.warn("Firebase:", e));
    // Ordem das colunas na aba: A Matrícula | B Nome | C Empresa | D E-mail
    await Sheets.appendRow(APP_CONFIG.sheets.operacaoTrafego, [
      usuario.matricula, usuario.nome, usuario.empresa, usuario.email
    ]);
    toast("Usuário cadastrado com sucesso.");
    $("formUsuario").reset();
    await carregarUsuarios();
  } catch (e) {
    if (Sheets.tratarErroSessao(e)) return;
    toast("Erro ao cadastrar usuário: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Cadastrar Usuário";
  }
}

async function carregarUsuarios() {
  const rows = await Sheets.getValues(`${APP_CONFIG.sheets.operacaoTrafego}!A2:D`);
  const list = $("listaUsuarios");
  list.innerHTML = "";

  const daEmpresa = rows.filter(r => (r[2] || "") === PERFIL.empresa);

  if (!daEmpresa.length) {
    list.innerHTML = '<div class="empty-state">Nenhum usuário cadastrado ainda nessa empresa.</div>';
    return;
  }
  daEmpresa.slice().reverse().forEach(r => {
    const [matricula, nome, empresa, email] = r;
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div>
        <div>${nome}</div>
        <div class="muted">${empresa} · mat. ${matricula}</div>
      </div>
      <span class="muted mono" style="font-size:11px;">${email}</span>`;
    list.appendChild(row);
  });
}

boot();

/* ---------------------------------------------------------- */
/* MAIÚSCULO AUTOMÁTICO NOS CAMPOS DE TEXTO LIVRE                */
/* ---------------------------------------------------------- */

function aplicarMaiusculoAutomatico(ids) {
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

aplicarMaiusculoAutomatico(["eqModelo", "eqSerie", "usMatricula", "usNome"]);