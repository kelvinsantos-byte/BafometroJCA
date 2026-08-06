/**
 * ============================================================
 *  ADM.JS — Portal administrativo (cadastro de equipamentos e usuários)
 *  Acesso restrito a e-mails cadastrados na aba ADM.
 * ============================================================
 */

let PERFIL = null;
let EQUIPAMENTOS = []; // [{rowIndex, modelo, serie, afericao, validade, status}]
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

  setupTabs();
  setupEventos();
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
  });
  $("btnSair").addEventListener("click", async () => {
    await Auth.signOut();
    window.location.href = "index.html";
  });
}

/* ---------------------------------------------------------- */
/* CADASTRAR EQUIPAMENTO -> aba CONTROLE DE EQUIPAMENTOS        */
/* ---------------------------------------------------------- */

async function cadastrarEquipamento(ev) {
  ev.preventDefault();
  const btn = $("btnCadastrarEquip");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  const equipamento = {
    modelo: $("eqModelo").value.trim(),
    serie: $("eqSerie").value.trim(),
    afericao: $("eqAfericao").value,
    validade: $("eqValidade").value
  };

  try {
    await FirebaseDB.salvarEquipamento(equipamento).catch(e => console.warn("Firebase:", e));
    await Sheets.appendRow(APP_CONFIG.sheets.equipamentos, [
      equipamento.modelo, equipamento.serie, equipamento.afericao, equipamento.validade, "Ativo", ""
    ]);
    toast("Equipamento cadastrado com sucesso.");
    $("formEquipamento").reset();
    await carregarEquipamentos();
  } catch (e) {
    toast("Erro ao cadastrar equipamento: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Cadastrar Equipamento";
  }
}

async function carregarEquipamentos() {
  const rows = await Sheets.getValues(`${APP_CONFIG.sheets.equipamentos}!A2:F`);

  EQUIPAMENTOS = rows.map((r, i) => ({
    rowIndex: i + 2, // linha real na planilha (cabeçalho ocupa a linha 1)
    modelo: r[0], serie: r[1], afericao: r[2], validade: r[3],
    status: r[4] || "Ativo", dataBaixa: r[5] || ""
  }));

  const list = $("listaEquipamentos");
  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state">Nenhum equipamento cadastrado ainda.</div>';
  } else {
    rows.slice().reverse().forEach(r => {
      const [modelo, serie, afericao, validade, status] = r;
      const vencido = validade && parseDataEquipamento(validade) && parseDataEquipamento(validade) < new Date();
      const pillClass = status === "Baixado" ? "error" : vencido ? "warn" : "ok";
      const pillText = status === "Baixado" ? "Baixado" : vencido ? "Vencido" : "Ativo";
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `
        <div>
          <div>${modelo}</div>
          <div class="muted mono">Nº ${serie} · válido até ${validade || "—"}</div>
        </div>
        <span class="pill ${pillClass}">${pillText}</span>`;
      list.appendChild(row);
    });
  }

  const ocorrenciaSelect = $("campoEquipamentoOcorrencia");
  ocorrenciaSelect.innerHTML = '<option value="">Selecione o equipamento…</option>';
  EQUIPAMENTOS.filter(e => e.status !== "Baixado").forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.serie;
    opt.textContent = `${e.modelo} · Nº série ${e.serie}`;
    ocorrenciaSelect.appendChild(opt);
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

  try {
    if (motivo === "Baixa de Equipamento") {
      // Atualiza colunas E (Status) e F (Data de Baixa) da linha do equipamento
      await Sheets.updateRange(
        `${APP_CONFIG.sheets.equipamentos}!E${equip.rowIndex}:F${equip.rowIndex}`,
        ["Baixado", hojeISO()]
      );
      await FirebaseDB.salvarOcorrenciaEquipamento({
        serie, tipo: "Baixa", registradoPor: PERFIL.nome, dataBaixa: hojeISO()
      }).catch(() => {});
      toast(`Equipamento ${serie} baixado com sucesso.`);
    } else {
      const motivoManutencao = $("campoMotivoManutencao").value;
      await Sheets.appendRow(APP_CONFIG.sheets.manutencaoEquipamentos, [
        serie, hojeISO(), motivoManutencao, "", PERFIL.nome
      ]);
      await FirebaseDB.salvarOcorrenciaEquipamento({
        serie, tipo: "Manutenção", motivo: motivoManutencao, registradoPor: PERFIL.nome, dataEnvio: hojeISO()
      }).catch(() => {});
      toast(`Equipamento ${serie} enviado para manutenção (${motivoManutencao}).`);
    }
    await carregarEquipamentos();
    $("formOcorrencia").reset();
    $("blocoMotivoManutencao").style.display = "none";
  } catch (e) {
    toast("Erro ao registrar ocorrência: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Registrar Ocorrência";
  }
}

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
    empresa: $("usEmpresa").value.trim(),
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
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state">Nenhum usuário cadastrado ainda.</div>';
    return;
  }
  rows.slice().reverse().forEach(r => {
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