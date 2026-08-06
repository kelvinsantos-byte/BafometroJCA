/**
 * ============================================================
 *  AUTH.JS — Login Google restrito ao domínio JCA
 * ============================================================
 *  Usa o MESMO padrão da plataforma JCA Treinamentos (que já
 *  funciona em produção): SDK MODULAR do Firebase + signInWithPopup.
 *  Isso evita os bugs conhecidos do SDK "compat" com popups.
 *
 *  Fluxo:
 *   1. Usuário clica em "Entrar com Google"
 *   2. Login via Firebase Authentication (popup, provedor Google),
 *      com o escopo extra do Sheets solicitado no mesmo consentimento
 *   3. O resultado traz DUAS coisas ao mesmo tempo:
 *        - uma sessão real no Firebase Auth (request.auth nas regras
 *          de segurança do Firestore deixa de ser null)
 *        - um access_token OAuth (via credential) usado pra ler/
 *          gravar na planilha do Google Sheets
 *   4. Validamos o domínio do e-mail (@viacaocometa.com etc.)
 *   5. Procuramos o e-mail nas abas ADM / OPERAÇÃO-TRÁFEGO /
 *      INSTRUTORES JCA para descobrir o perfil e liberar a rota
 * ============================================================
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const MOCK_MODE = !APP_CONFIG.googleClientId || APP_CONFIG.googleClientId.startsWith("COLE_AQUI");

let accessToken = null;
let authInstance = null;

function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(APP_CONFIG.firebase);
}

function getAuthInstance() {
  if (!authInstance) authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

/** Login simulado — usado só em MOCK_MODE, sem depender do Google/Firebase */
function mockSignIn(email) {
  const userInfo = { email: email.toLowerCase(), name: email.split("@")[0], picture: "" };
  accessToken = "mock-token";
  sessionStorage.setItem("baf_access_token", accessToken);
  sessionStorage.setItem("baf_user", JSON.stringify(userInfo));
  return Promise.resolve(userInfo);
}

async function init() {
  return Promise.resolve();
}

/** Dispara o popup de login (Firebase Auth + Google) e resolve com { email, name, picture } */
async function signIn() {
  if (MOCK_MODE) throw new Error("Auth em modo de teste — use o login simulado.");

  const provider = new GoogleAuthProvider();
  provider.addScope(APP_CONFIG.googleScopes);

  let result;
  try {
    result = await signInWithPopup(getAuthInstance(), provider);
  } catch (err) {
    if (err.code === "auth/popup-closed-by-user") throw new Error("Login cancelado.");
    if (err.code === "auth/popup-blocked") throw new Error("O navegador bloqueou o popup de login. Permita popups para este site.");
    throw new Error(err.message || "Não foi possível entrar com o Google.");
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential || !credential.accessToken) {
    throw new Error(
      "Não foi possível obter permissão de acesso à planilha do Google. " +
      "Tente novamente e aceite todas as permissões solicitadas na tela do Google."
    );
  }
  accessToken = credential.accessToken;

  const userInfo = {
    email: (result.user.email || "").toLowerCase(),
    name: result.user.displayName || result.user.email,
    picture: result.user.photoURL || ""
  };

  if (!isDomainAllowed(userInfo.email)) {
    await signOut();
    throw new Error("Este e-mail não pertence ao domínio corporativo do Grupo JCA.");
  }

  sessionStorage.setItem("baf_access_token", accessToken);
  sessionStorage.setItem("baf_user", JSON.stringify(userInfo));
  return userInfo;
}

function isDomainAllowed(email) {
  return APP_CONFIG.allowedDomains.some(d => email.endsWith("@" + d));
}

function getAccessToken() {
  return accessToken || sessionStorage.getItem("baf_access_token");
}

function getCurrentUser() {
  const raw = sessionStorage.getItem("baf_user");
  return raw ? JSON.parse(raw) : null;
}

async function signOut() {
  if (!MOCK_MODE) {
    try { await fbSignOut(getAuthInstance()); } catch (e) { /* ignora */ }
  }
  sessionStorage.clear();
  accessToken = null;
}

/**
 * Procura o e-mail nas abas de cadastro e devolve o perfil encontrado.
 * Ordem de checagem: ADM > INSTRUTORES JCA > OPERAÇÃO / TRÁFEGO
 * (um mesmo e-mail pode existir em mais de uma aba; ADM tem prioridade
 * de acesso ao portal administrativo)
 */
async function resolveProfile(email) {
  const [admRows, instrutorRows, operacaoRows] = await Promise.all([
    Sheets.getValues(`${APP_CONFIG.sheets.adm}!A2:D`),
    Sheets.getValues(`${APP_CONFIG.sheets.instrutoresJca}!A2:E`),
    Sheets.getValues(`${APP_CONFIG.sheets.operacaoTrafego}!A2:D`)
  ]);

  const findByEmail = (rows) => rows.find(
    row => (row[3] || "").toLowerCase().trim() === email
  );

  const admMatch = findByEmail(admRows);
  if (admMatch) {
    return {
      role: "adm",
      matricula: admMatch[0], nome: admMatch[1], empresa: admMatch[2], email: admMatch[3]
    };
  }

  const instrutorMatch = findByEmail(instrutorRows);
  if (instrutorMatch) {
    return {
      role: "instrutor",
      matricula: instrutorMatch[0], nome: instrutorMatch[1],
      empresa: instrutorMatch[2], email: instrutorMatch[3], filial: instrutorMatch[4]
    };
  }

  const operacaoMatch = findByEmail(operacaoRows);
  if (operacaoMatch) {
    return {
      role: "operacao",
      matricula: operacaoMatch[0], nome: operacaoMatch[1],
      empresa: operacaoMatch[2], email: operacaoMatch[3]
    };
  }

  return null; // e-mail é do domínio JCA, mas não está cadastrado em nenhuma aba
}

window.Auth = {
  init, signIn, signOut, getAccessToken, getCurrentUser, resolveProfile,
  isDomainAllowed, mockSignIn, isMockMode: () => MOCK_MODE
};