/**
 * ============================================================
 *  FORNECEDOR.JS — Cadastro de fornecedores (portal ADM)
 * ============================================================
 *  Aba FORNECEDORES no Sheets:
 *  A Nome Fantasia | B CNPJ | C Endereço | D Empresa | E Regional
 *
 *  Cada ADM só vê/cadastra fornecedores da PRÓPRIA empresa — a
 *  coluna D é preenchida automaticamente com PERFIL.empresa, sem
 *  o usuário escolher (mesmo padrão de isolamento por domínio já
 *  usado nos equipamentos).
 * ============================================================
 */

const $ = (id) => document.getElementById(id);
let FORNECEDORES = [];

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

async function carregarFornecedores() {
  const perfil = getPerfil();
  if (!perfil) return;

  const rows = await Sheets.getValues(`${APP_CONFIG.sheets.fornecedores}!A2:E`);
  FORNECEDORES = rows
    .map(r => ({ nome: r[0] || "", cnpj: r[1] || "", endereco: r[2] || "", empresa: r[3] || "", regional: r[4] || "" }))
    .filter(f => f.nome && f.empresa === perfil.empresa); // só a empresa desse ADM

  renderListaFornecedores();
}

function renderListaFornecedores() {
  const list = $("listaFornecedores");
  if (!list) return;
  list.innerHTML = "";

  if (!FORNECEDORES.length) {
    list.innerHTML = '<div class="empty-state">Nenhum fornecedor cadastrado ainda.</div>';
    return;
  }

  FORNECEDORES.slice().reverse().forEach(f => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div>
        <div>${f.nome}</div>
        <div class="muted mono">${f.cnpj || "—"}</div>
        <div class="muted" style="font-size:11px;">${f.endereco || "—"}</div>
      </div>
      <span class="pill ok">${f.regional || "—"}</span>`;
    list.appendChild(row);
  });
}

async function cadastrarFornecedor(ev) {
  ev.preventDefault();
  const perfil = getPerfil();
  if (!perfil) return;

  const fornecedor = {
    nome: $("fnNome").value.trim(),
    cnpj: $("fnCnpj").value.trim(),
    endereco: $("fnEndereco").value.trim(),
    empresa: perfil.empresa,
    regional: $("fnRegional").value
  };

  const btn = $("btnCadastrarFornecedor");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Salvando…';

  try {
    await Sheets.appendRow(APP_CONFIG.sheets.fornecedores, [
      fornecedor.nome, fornecedor.cnpj, fornecedor.endereco, fornecedor.empresa, fornecedor.regional
    ]);
    toast("Fornecedor cadastrado com sucesso.");
    $("formFornecedor").reset();
    await carregarFornecedores();
  } catch (e) {
    if (window.Sheets && Sheets.tratarErroSessao(e)) return;
    toast("Erro ao cadastrar fornecedor: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Cadastrar Fornecedor";
  }
}

/** Formata em tempo real como 00.000.000/0000-00, aceitando só números digitados */
function aoDigitarCnpj(ev) {
  let digitos = ev.target.value.replace(/\D/g, "").slice(0, 14);
  let formatado = digitos;
  if (digitos.length > 2) formatado = digitos.slice(0, 2) + "." + digitos.slice(2);
  if (digitos.length > 5) formatado = formatado.slice(0, 6) + "." + digitos.slice(5);
  if (digitos.length > 8) formatado = formatado.slice(0, 10) + "/" + digitos.slice(8);
  if (digitos.length > 12) formatado = formatado.slice(0, 15) + "-" + digitos.slice(12);
  ev.target.value = formatado;
}

async function initFornecedor() {
  if (!document.getElementById("formFornecedor")) return; // painel só existe no portal ADM
  await carregarFornecedores();
  $("formFornecedor").addEventListener("submit", cadastrarFornecedor);
  $("fnCnpj").addEventListener("input", aoDigitarCnpj);
  ["fnNome", "fnEndereco"].forEach(id => {
    $(id).addEventListener("input", () => {
      const pos = $(id).selectionStart;
      $(id).value = $(id).value.toUpperCase();
      $(id).setSelectionRange(pos, pos);
    });
  });
}

initFornecedor();