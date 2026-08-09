# Bafômetro JCA — PWA de controle de aplicações

Ferramenta em PWA (HTML + CSS + JS puro, sem build) para controlar a aplicação
de testes de bafômetro nas bases São Paulo, Rio de Janeiro e Sul do Grupo JCA.
Grava em duas camadas: **Firebase (Firestore)** como registro rápido/redundante
e **Google Sheets** como fonte oficial de controle gerencial.

## Como testar agora, sem configurar nada

O projeto já vem em **modo de teste** (mock): `js/config.js` está com valores
de exemplo (`COLE_AQUI_...`), então o app detecta isso sozinho e passa a usar:

- Login simulado (escolha um usuário fictício na tela inicial, sem precisar do Google);
- `data/mock-sheets.json` como planilha fictícia (as abas ADM, INSTRUTORES JCA,
  OPERAÇÃO/TRÁFEGO, CONTRATOS, RECEPÇÃO ATIVA, CONTROLE DE EQUIPAMENTOS e
  MANUTENÇÃO EQUIPAMENTOS já vêm com alguns registros de exemplo);
- Tudo que você cadastrar ou lançar fica salvo no `localStorage` do navegador.

Basta abrir `index.html` num servidor local (não funciona em `file://` por causa
do `fetch` dos JSONs). O jeito mais simples:

```bash
cd bafometro
python3 -m http.server 8080
# depois abra http://localhost:8080 no navegador (ou no celular, na mesma rede)
```

Para voltar ao estado inicial dos dados de teste, limpe o `localStorage` do site
(ou abra em uma aba anônima).

## Como colocar em produção (dados reais)

### 1. Planilha Google Sheets
Crie (ou use a existente) uma planilha com as abas abaixo, respeitando exatamente
os nomes e a ordem das colunas (linha 1 = cabeçalho):

| Aba | Colunas |
|---|---|
| `BASE SAO`, `BASE RIO`, `BASE SUL` | A Data/Hora · B Empresa · C Aplicador · D Contrato/Local · E Motorista · F Setor · G Resultado Teste (Negativo/Positivo) · H Resultado (mg/L) · I/J *(legado, não usadas mais)* · K Equipamento · **L Tentativa do dia (1/2/3)** |
| `CONTROLE DE EQUIPAMENTOS` | A Modelo · B Nº Série · C Aferição · D Validade · E Status · F Data de Baixa · G Garagem · **H Empresa** |
| `MANUTENÇÃO EQUIPAMENTOS` | A Modelo · B Nº Série · C Data de Envio · D Data de Retorno · E Motivo Manutenção · F Baixa (data) · **G Registrado por** |
| `CONTRATOS` | A Empresa · B Contrato |
| `RECEPÇÃO ATIVA` | A Empresa · B Garagem |
| `OPERAÇÃO / TRÁFEGO` | A Matrícula · B Nome · C Empresa · D E-mail |
| `ADM` | A Matrícula · B Nome · C Empresa · D E-mail |
| `INSTRUTORES JCA` | A Matrícula · B Nome · C Empresa · D E-mail · E Filial |

Compartilhe a planilha (Editor) com as contas Google que vão usar o app — o
acesso à API usa o token OAuth do próprio usuário logado, então cada pessoa
precisa ter permissão de edição na planilha.

Copie o ID da planilha (trecho da URL entre `/d/` e `/edit`) para
`js/config.js` → `spreadsheetId`.

### 2. Google Cloud (login + Sheets API)
No [Google Cloud Console](https://console.cloud.google.com):
1. Crie um projeto (ou use um existente do Grupo JCA).
2. Em **APIs & Services → Library**, ative a **Google Sheets API**.
3. Em **APIs & Services → Credentials**, crie um **OAuth Client ID** do tipo
   *Web application*. Adicione o domínio onde o PWA vai ficar publicado em
   *Authorized JavaScript origins* (ex: `https://bafometro.jca.com.br`).
4. Se quiser restringir ainda mais o consentimento, configure a *OAuth consent
   screen* como **Interno** (Google Workspace) — assim só contas do domínio
   corporativo conseguem sequer ver a tela de login.
5. Copie o Client ID para `js/config.js` → `googleClientId`.

### 3. Firebase
No [Firebase Console](https://console.firebase.google.com):
1. Crie um projeto → ative **Firestore Database** (modo produção).
2. Em *Configurações do projeto → Seus apps → Web*, copie as credenciais
   para `js/config.js` → `firebase`.
3. Recomenda-se criar regras do Firestore que só permitam leitura/escrita para
   usuários autenticados no domínio JCA (o SDK de auth do Firebase não é usado
   aqui — a autenticação é 100% via Google Identity Services — então, se quiser
   travar por regra de segurança, use Firebase Auth com o mesmo Client ID ou
   valide no back-end via Cloud Functions).

### 4. Publicar como PWA
Suba a pasta inteira (ela é 100% estática) em qualquer hospedagem com HTTPS:
Firebase Hosting, Vercel, Netlify, GitHub Pages, etc. HTTPS é obrigatório para
o Service Worker e para o login Google funcionarem.

## Estrutura de arquivos

```
bafometro/
├── index.html              → tela de login (único ponto de entrada)
├── portal-adm.html          → portal do administrador
├── portal-operacao.html     → portal operacional (aplicadores/instrutores)
├── manifest.json / sw.js    → PWA (instalável, funciona com cache básico offline)
├── css/style.css            → identidade visual única do projeto
├── js/
│   ├── config.js             → TODAS as chaves/IDs ficam só aqui
│   ├── auth.js               → login Google + restrição de domínio + perfil
│   ├── sheets.js              → leitura/escrita no Google Sheets (+ modo mock)
│   ├── firebase-init.js       → gravação redundante no Firestore
│   ├── adm.js                 → lógica do portal do administrador
│   ├── operacao.js            → lógica do portal operacional
│   └── pwa.js                 → registro do service worker
├── data/
│   ├── motoristas.json        → base de motoristas para autocomplete no teste
│   └── mock-sheets.json       → planilha fictícia usada só no modo de teste
└── icons/                    → ícones do PWA
```

## Observações importantes (pontos que valem confirmar com você)

1. **Aba `MANUTENÇÃO EQUIPAMENTOS`**: você mencionou "se o número de série não
   tiver data de retorno na aba de manutenção o equipamento fica indisponível",
   mas essa aba não estava na lista original — criei uma aba nova com esse nome
   para guardar o histórico (data de envio, motivo, data de retorno). Se preferir
   outro nome/local, é só ajustar em `js/config.js`.
2. **Colunas extras em `CONTROLE DE EQUIPAMENTOS`**: adicionei as colunas
   **E Status** (Ativo/Baixado) e **F Data de Baixa**, usadas pelo fluxo de
   "Reportar Equipamento → Baixa". Sem elas não dá para bloquear o uso de um
   equipamento baixado.
3. **Campo Garagem**: você pediu para puxar as garagens da aba `RECEPÇÃO ATIVA`
   na tela de teste, mas as colunas da `BASE SAO/RIO/SUL` (A a F) não têm um
   lugar definido para isso. Hoje o campo aparece no formulário e é salvo no
   Firestore junto com o teste, mas **não é gravado na planilha** — se quiser
   que a garagem também vá para o Sheets, é só me avisar que acrescento uma
   coluna G (ou o que preferir) nas abas BASE.
4. **Motoristas via JSON**: como pedido, os motoristas não vêm do Sheets — o
   autocomplete usa `data/motoristas.json`. Troque esse arquivo pela base real
   (ou aponte para uma API interna) quando for para produção.
5. **Domínio "autoviacaocatarinense"**: no seu texto veio sem `.com.br` no
   final — assumi `autoviacaocatarinense.com.br` (mesmo padrão dos outros).
   Ajuste em `js/config.js` → `allowedDomains` se o domínio real for diferente.
6. **Resultado do teste**: implementei como Aprovado/Reprovado (dois botões).
   Se vocês usam um valor numérico (ex: taxa de álcool), é só trocar o campo.

## Testando com o `data/testes-exemplo.json`

Esse arquivo simula uma carga inicial de testes já aplicados, útil para ver o
dashboard funcionando com histórico. Não é consumido automaticamente pelo app —
é só uma massa de dados de referência caso você queira importar manualmente na
planilha real ou usar em outro teste automatizado.