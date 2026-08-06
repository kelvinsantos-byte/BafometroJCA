/**
 * ============================================================
 *  SHEETS.JS — Camada de acesso à planilha (Google Sheets API v4)
 * ============================================================
 *  Usa o access_token do usuário logado (Auth.getAccessToken()).
 *  O usuário precisa ter permissão de EDITOR na planilha configurada
 *  em APP_CONFIG.spreadsheetId.
 * ============================================================
 */

const Sheets = (() => {

  const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

  // Modo simulação: liga automaticamente enquanto js/config.js não tiver
  // um spreadsheetId real preenchido. Usa data/mock-sheets.json + localStorage,
  // assim dá pra testar 100% da navegação sem depender do Google.
  const MOCK_MODE = !APP_CONFIG.spreadsheetId || APP_CONFIG.spreadsheetId.startsWith("COLE_AQUI");
  const MOCK_LS_KEY = "baf_mock_sheets_data";
  let mockCache = null;

  async function loadMock() {
    if (mockCache) return mockCache;
    const saved = localStorage.getItem(MOCK_LS_KEY);
    if (saved) {
      mockCache = JSON.parse(saved);
      return mockCache;
    }
    const resp = await fetch("data/mock-sheets.json");
    mockCache = await resp.json();
    return mockCache;
  }

  function persistMock() {
    localStorage.setItem(MOCK_LS_KEY, JSON.stringify(mockCache));
  }

  function parseRange(range) {
    // ex: "BASE SAO!A2:F" -> { sheet: "BASE SAO", startRow: 2 }
    const [sheet, cellRange] = range.split("!");
    const startCell = (cellRange || "A1").split(":")[0];
    const rowMatch = startCell.match(/\d+/);
    const startRow = rowMatch ? parseInt(rowMatch[0], 10) : 1;
    return { sheet, startRow };
  }

  function headers() {
    const token = Auth.getAccessToken();
    if (!token) throw new Error("Usuário não autenticado.");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  async function handle(resp) {
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body?.error?.message || `Erro na Sheets API (HTTP ${resp.status})`);
    }
    return resp.json();
  }

  /** Lê um intervalo, ex: "BASE SAO!A2:F" — retorna array de arrays */
  async function getValues(range) {
    if (MOCK_MODE) {
      const data = await loadMock();
      const { sheet, startRow } = parseRange(range);
      const rows = data[sheet] || [];
      return rows.slice(Math.max(startRow - 2, 0));
    }
    const url = `${BASE}/${APP_CONFIG.spreadsheetId}/values/${encodeURIComponent(range)}`;
    const resp = await fetch(url, { headers: headers() });
    const data = await handle(resp);
    return data.values || [];
  }

  function colLetraParaIndice(letra) {
    // "A" -> 0, "B" -> 1, ..., "J" -> 9
    let n = 0;
    for (let i = 0; i < letra.length; i++) n = n * 26 + (letra.charCodeAt(i) - 64);
    return n - 1;
  }

  function parseRangeCompleto(range) {
    // ex: "BASE SAO!I15:J15" -> { sheet, startRow, startCol, endCol }
    const [sheet, cellRange] = range.split("!");
    const [startCell, endCell] = (cellRange || "A1").split(":");
    const startMatch = startCell.match(/^([A-Z]+)(\d+)$/i);
    const startCol = startMatch ? colLetraParaIndice(startMatch[1].toUpperCase()) : 0;
    const startRow = startMatch ? parseInt(startMatch[2], 10) : 1;
    return { sheet, startRow, startCol };
  }

  /** Acrescenta uma linha ao final da tabela (aba inteira, ex: "BASE SAO").
   *  Devolve também o número da linha real onde a linha caiu na planilha
   *  (necessário pra depois atualizar colunas específicas dessa mesma linha,
   *  ex: registrar o resultado do reteste). */
  async function appendRow(sheetName, rowValues) {
    if (MOCK_MODE) {
      const data = await loadMock();
      if (!data[sheetName]) data[sheetName] = [];
      data[sheetName].push(rowValues);
      persistMock();
      const rowIndex = data[sheetName].length + 1; // +1 porque a linha 1 é cabeçalho
      return { updates: { updatedRows: 1 }, rowIndex };
    }
    const range = `${sheetName}!A1`;
    const url = `${BASE}/${APP_CONFIG.spreadsheetId}/values/${encodeURIComponent(range)}:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ values: [rowValues] })
    });
    const result = await handle(resp);
    // updatedRange vem como "'BASE SAO'!A15:H15" — extrai o número da linha
    const updatedRange = result?.updates?.updatedRange || "";
    const rowMatch = updatedRange.match(/![A-Z]+(\d+)/i);
    const rowIndex = rowMatch ? parseInt(rowMatch[1], 10) : null;
    return { ...result, rowIndex };
  }

  /** Sobrescreve um intervalo específico (usado pra "dar baixa" numa linha
   *  existente, ou pra gravar o resultado do reteste em colunas específicas
   *  sem mexer no resto da linha) */
  async function updateRange(range, rowValues) {
    if (MOCK_MODE) {
      const data = await loadMock();
      const { sheet, startRow, startCol } = parseRangeCompleto(range);
      const idx = startRow - 2;
      if (!data[sheet]) data[sheet] = [];
      if (!data[sheet][idx]) data[sheet][idx] = [];
      const linha = data[sheet][idx];
      rowValues.forEach((valor, i) => {
        linha[startCol + i] = valor; // só sobrescreve as colunas pedidas, preserva o resto
      });
      persistMock();
      return { updatedCells: rowValues.length };
    }
    const url = `${BASE}/${APP_CONFIG.spreadsheetId}/values/${encodeURIComponent(range)}` +
      `?valueInputOption=USER_ENTERED`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ values: [rowValues] })
    });
    return handle(resp);
  }

  return { getValues, appendRow, updateRange, isMockMode: () => MOCK_MODE };
})();