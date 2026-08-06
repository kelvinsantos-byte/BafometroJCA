/**
 * ============================================================
 *  FIREBASE-INIT.JS — Persistência redundante no Firestore
 * ============================================================
 *  SDK MODULAR (mesmo padrão do auth.js e da plataforma
 *  JCA Treinamentos), não o "compat".
 *
 *  Toda gravação da plataforma (teste aplicado, equipamento
 *  cadastrado, usuário cadastrado, ocorrência de manutenção/baixa)
 *  é gravada no Firestore E no Google Sheets, nessa ordem:
 *    1) Firestore primeiro (rápido)
 *    2) Sheets em seguida (fonte "oficial" de controle gerencial)
 *  Se o passo 2 falhar, o registro fica marcado como
 *  "pendingSheetsSync" no Firestore para reprocessar depois
 *  (ver FirebaseDB.reprocessPending).
 * ============================================================
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc,
  serverTimestamp, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let db = null;

function init() {
  const app = getApps().length ? getApp() : initializeApp(APP_CONFIG.firebase);
  db = getFirestore(app);
}

function ensureDb() {
  if (!db) throw new Error("Firestore não inicializado.");
  return db;
}

/** Grava o teste aplicado. base = "São Paulo" | "Rio de Janeiro" | "Sul" */
async function salvarTeste(base, teste) {
  const ref = await addDoc(collection(ensureDb(), "testes_aplicados"), {
    ...teste,
    base,
    pendingSheetsSync: true,
    criadoEm: serverTimestamp()
  });
  return ref.id;
}

async function marcarSincronizado(docId) {
  await updateDoc(doc(ensureDb(), "testes_aplicados", docId), { pendingSheetsSync: false });
}

async function salvarEquipamento(equipamento) {
  return addDoc(collection(ensureDb(), "equipamentos"), {
    ...equipamento,
    criadoEm: serverTimestamp()
  });
}

async function salvarUsuario(usuario) {
  return addDoc(collection(ensureDb(), "usuarios_cadastrados"), {
    ...usuario,
    criadoEm: serverTimestamp()
  });
}

async function salvarOcorrenciaEquipamento(ocorrencia) {
  return addDoc(collection(ensureDb(), "ocorrencias_equipamento"), {
    ...ocorrencia,
    criadoEm: serverTimestamp()
  });
}

/** Reenvia ao Sheets os registros que falharam na primeira tentativa */
async function reprocessPending(sendToSheetsFn) {
  const q = query(collection(ensureDb(), "testes_aplicados"), where("pendingSheetsSync", "==", true));
  const snap = await getDocs(q);
  for (const docSnap of snap.docs) {
    try {
      await sendToSheetsFn(docSnap.data());
      await marcarSincronizado(docSnap.id);
    } catch (e) {
      console.warn("Ainda não foi possível sincronizar o teste", docSnap.id, e);
    }
  }
}

window.FirebaseDB = {
  init, salvarTeste, marcarSincronizado, salvarEquipamento,
  salvarUsuario, salvarOcorrenciaEquipamento, reprocessPending
};