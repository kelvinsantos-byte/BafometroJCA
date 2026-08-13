/**
 * ============================================================
 *  CONFIG.JS — Configuração central do sistema Bafômetro JCA
 * ============================================================
 *  Preencha TODOS os campos abaixo antes de publicar o app.
 *  Nenhum outro arquivo deve conter chaves/IDs — tudo fica aqui.
 * ============================================================
 */

const APP_CONFIG = {

  // --------------------------------------------------------
  // 1. FIREBASE
  //    Console: https://console.firebase.google.com
  //    Crie um projeto > Configurações do projeto > Seus apps > Web
  // --------------------------------------------------------
  firebase: {
    apiKey: "AIzaSyCLnJ1-WN63RDIgcKDXqXuF9wg9516HIHc",
    authDomain: "controle-bafometro.firebaseapp.com",
    projectId: "controle-bafometro",
    storageBucket: "controle-bafometro.firebasestorage.app",
    messagingSenderId: "608371479778",
    appId: "1:608371479778:web:59d5ac2394f63590a8fabb",
    measurementId: "G-MP0EQ5QC31"
  },

  // --------------------------------------------------------
  // 2. GOOGLE OAUTH / IDENTITY SERVICES
  //    Console: https://console.cloud.google.com/apis/credentials
  //    Crie um "OAuth 2.0 Client ID" tipo "Web application"
  //    Adicione o domínio onde o PWA será publicado em
  //    "Authorized JavaScript origins" e "Authorized redirect URIs"
  //    Ative também a "Google Sheets API" em APIs & Services.
  // --------------------------------------------------------
  googleClientId: "608371479778-vsd35u9piu6lbftmouoful9o46r7l3u8.apps.googleusercontent.com",

  // Escopo necessário para ler/gravar na planilha do usuário logado
  googleScopes: "https://www.googleapis.com/auth/spreadsheets",

  // --------------------------------------------------------
  // 3. PLANILHA GOOGLE SHEETS (banco de dados operacional)
  //    Copie o ID a partir da URL da planilha:
  //    https://docs.google.com/spreadsheets/d/ESSE_TRECHO_AQUI/edit
  // --------------------------------------------------------
  spreadsheetId: "1raLN34g3PDKIZBLT_IQsaI-pezlcmD4WKCuvYlnDBo4",

  // --------------------------------------------------------
  // 4. DOMÍNIOS CORPORATIVOS PERMITIDOS (Grupo JCA)
  //    Só e-mails terminados nesses domínios conseguem logar.
  // --------------------------------------------------------
  allowedDomains: [
    "viacaocometa.com.br",
    "autoviacao1001.com.br",
    "catarinense.com.br",
    "sitmacae.com.br",
    "opcaofretur.com.br"
  ],

  // --------------------------------------------------------
  // 5. MAPA DE REGIONAIS → aba de lançamento dos testes
  //    Chave = valor exibido/selecionado no formulário (SAO/RIO/SUL)
  //    Valor = nome exato da aba na planilha
  // --------------------------------------------------------
  bases: {
    "SAO": "BASE SAO",
    "RIO": "BASE RIO",
    "SUL": "BASE SUL"
  },

  // --------------------------------------------------------
  // 5b. EMPRESAS DO GRUPO JCA — usado para popular o campo Empresa
  //    na tela de Aplicar Teste. Precisa bater EXATAMENTE (maiúsculas,
  //    acentos, espaços) com o que está escrito na coluna Empresa das
  //    abas CONTRATOS e RECEPÇÃO ATIVA, senão os filtros não encontram
  //    nada (mesmo tipo de problema que já tivemos com allowedDomains).
  // --------------------------------------------------------
  empresas: [
    "VIAÇÃO COMETA",
    "RÁPIDO RIBEIRÃO",
    "EXPRESSO DO SUL",
    "AUTO VIAÇÃO CATARINENSE",
    "AUTO VIAÇÃO 1001",
    "SIT / MACAENSE",
    "OPÇÃO - TURISMO E FRETAMENTOS"
  ],

  // --------------------------------------------------------
  // 6. NOMES DAS ABAS DA PLANILHA (não altere a menos que
  //    a planilha real use nomes diferentes destes)
  //
  //    ATENÇÃO — colunas adicionadas em relação ao pedido original,
  //    necessárias para o fluxo de Manutenção/Baixa de equipamento:
  //
  //    CONTROLE DE EQUIPAMENTOS
  //      A Modelo | B Nº de Série | C Aferição | D Validade
  //      E Status ("Ativo" / "Baixado")  F Data de Baixa
  //
  //    MANUTENÇÃO EQUIPAMENTOS (aba nova)
  //      A Nº de Série | B Data de Envio | C Motivo
  //      D Data de Retorno (em branco = ainda em manutenção,
  //        equipamento fica bloqueado para uso) | E Registrado por
  // --------------------------------------------------------
  sheets: {
    equipamentos: "CONTROLE DE EQUIPAMENTOS",
    contratos: "CONTRATOS",
    recepcaoAtiva: "RECEPÇÃO ATIVA",
    operacaoTrafego: "OPERAÇÃO / TRÁFEGO",
    adm: "ADM",
    instrutoresJca: "INSTRUTORES JCA",
    // Aba auxiliar (não estava na lista original, mas é necessária para
    // controlar quando um equipamento em manutenção pode voltar a ser usado)
    manutencaoEquipamentos: "MANUTENÇÃO EQUIPAMENTOS",
    fornecedores: "FORNECEDORES",
    contraprovaEstoque: "CONTRAPROVA ESTOQUE"
  },

  // --------------------------------------------------------
  // 7. MOTIVOS DE INDISPONIBILIDADE DE EQUIPAMENTO
  // --------------------------------------------------------
  motivosManutencao: [
    "Quebra de Equipamento",
    "Defeito do Equipamento",
    "Aferição"
  ],

  // --------------------------------------------------------
  // 7b. APPS SCRIPT — recebe o upload das evidências de contraprova
  //     e salva na pasta fixa do Drive (ver /apps-script/upload-
  //     evidencias.gs). Depois de publicar o script como Web App,
  //     cole aqui a URL que termina em "/exec".
  // --------------------------------------------------------
  appsScriptUploadUrl: "https://script.google.com/macros/s/AKfycbxsvwS8jdUn6CF1o5xiv4iaMbAMIfNezlB7rMei8H4cIcsvGEYkvVGUDGXrZpUHIvya/exec",

  // --------------------------------------------------------
  // 8. IDENTIDADE VISUAL — reaproveitada do projeto JCA Treinamentos
  //    (mesmos logos, mesma paleta por empresa). O badge do logo
  //    sempre usa fundo escuro (#0F1624), igual ao projeto original,
  //    para os logos brancos ficarem legíveis mesmo no tema claro.
  // --------------------------------------------------------
  brand: {
    grupoJcaLogo: "https://res.cloudinary.com/dln0ctawv/image/upload/v1786221931/jca-dark_feydzd.png",
    inteligenciaLogo: "https://res.cloudinary.com/dxnruvmgu/image/upload/v1776647491/Intelig%C3%AAncia_horizontal_branco_yxlsyw.png"
  },

  // Chave = mesmo texto usado no campo "Empresa" (perfil do usuário / abas ADM, OPERAÇÃO-TRÁFEGO etc.)
  companyBranding: {
    "Viação Cometa": {
      logo: "https://res.cloudinary.com/dxnruvmgu/image/upload/v1776644927/Cometa_iud8vx.png",
      color: "#00B4A6",
      initials: "COM"
    },
    "Auto Viação 1001": {
      logo: "https://res.cloudinary.com/dxnruvmgu/image/upload/v1776644927/1001_ynes4h.png",
      color: "#FFB800",
      initials: "AV1"
    },
    "Auto Viação Catarinense": {
      logo: "https://res.cloudinary.com/dxnruvmgu/image/upload/v1776644927/Catarinense_toqlsq.png",
      color: "#E85454",
      initials: "AVC"
    },
    "SIT Macaé": {
      logo: "https://res.cloudinary.com/dxnruvmgu/image/upload/v1776645576/Sit_gv7d2x.png",
      color: "#00B4D8",
      initials: "SIT"
    },
    "Opção Fretur": {
      logo: "https://res.cloudinary.com/dxnruvmgu/image/upload/v1776645466/Op%C3%A7%C3%A3o_ztgpnc.png",
      color: "#00D68F",
      initials: "OPF"
    }
  }
};

// Congela o objeto para evitar alterações acidentais em tempo de execução
Object.freeze(APP_CONFIG);
