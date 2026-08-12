/**
 * ============================================================
 *  DRIVE.JS — Upload de evidências (contraprova)
 * ============================================================
 *  Manda o arquivo pro Apps Script (ver /apps-script/upload-
 *  evidencias.gs), que salva na pasta fixa do Drive rodando
 *  com a identidade de quem publicou o script — não a do
 *  instrutor logado. Por isso, ninguém precisa de permissão
 *  individual na pasta do Drive (mesmo padrão do projeto de
 *  Treinamentos).
 * ============================================================
 */

/** Sobe um arquivo (imagem ou PDF) via Apps Script.
 *  Devolve { id, url } — o link é o que fica salvo no Sheets. */
async function uploadArquivo(arquivo, nomeArquivo) {
  if (window.Auth && Auth.isMockMode && Auth.isMockMode()) {
    // Modo de teste: não sobe de verdade, só simula o retorno
    return { id: "mock-" + Date.now(), webViewLink: "https://drive.google.com/mock-arquivo" };
  }

  const url = APP_CONFIG.appsScriptUploadUrl;
  if (!url || url.startsWith("COLE_AQUI")) {
    throw new Error("URL do Apps Script de upload não configurada (js/config.js → appsScriptUploadUrl).");
  }

  const arquivoBuffer = await arquivo.arrayBuffer();
  const arquivoBase64 = btoa(new Uint8Array(arquivoBuffer).reduce((s, b) => s + String.fromCharCode(b), ""));

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS no Apps Script
    body: JSON.stringify({
      nome: nomeArquivo || arquivo.name || `evidencia-${Date.now()}`,
      tipo: arquivo.type || "application/octet-stream",
      arquivoBase64
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || `Erro ao subir a evidência (HTTP ${resp.status})`);
  }
  return { id: data.id, webViewLink: data.url };
}

window.Drive = { uploadArquivo };