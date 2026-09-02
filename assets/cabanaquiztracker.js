// cabana-quiz-tracker.js — Cabana School
//
// Script compartilhado que qualquer curso HTML carrega (Forma A) ou que o injetor-tracker.html
// injeta sozinho (Forma B) pra reportar o resultado da prova embutida direto pro Firestore da
// Cabana School — sem o curso precisar saber nada sobre login. Ele só expõe:
//
//   window.CabanaSchool.reportResult(totalAcertos, totalPerguntas)
//
// O CPF e o ID do curso chegam pela URL da própria página que carregou este script
// (?cpf=...&cursoId=...) — é assim que a Home sempre abre um curso em HTML/link (ver contrato
// de integração). Este script autentica anonimamente no Firebase só pra ter permissão de
// escrita no Firestore, busca a nota mínima do curso (NotaAprovacao) e grava o resultado na
// coleção 'progresso', no MESMO formato que home.html já usa pra qualquer prova nativa da
// plataforma (Cpf, CursoId, CursoTitulo, Status, IniciadoEm, ConcluidoEm, UltimaNota, Tentativas).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyALJzDqdBpic88-0CnKXCBUpvMhfilskkg",
  authDomain: "cabana-school-c.firebaseapp.com",
  projectId: "cabana-school-c",
  storageBucket: "cabana-school-c.firebasestorage.app",
  messagingSenderId: "299980031099",
  appId: "1:299980031099:web:afcd83482c194d35400ede"
};

// nome próprio pro app, pra não colidir se a página do curso (por algum motivo) também
// inicializar o Firebase por conta própria com o app padrão
const app = initializeApp(firebaseConfig, 'cabana-quiz-tracker');
const auth = getAuth(app);
const db = getFirestore(app);

let _authPronto = null;
function garantirAuth(){
  if (!_authPronto) {
    _authPronto = signInAnonymously(auth).catch((e) => {
      console.error('[cabana-quiz-tracker] falha ao autenticar (anônimo) — confira se o método "Anônimo" está habilitado em Authentication > Sign-in method no console do Firebase:', e);
      throw e;
    });
  }
  return _authPronto;
}

function pegarParam(nome){
  try {
    return new URLSearchParams(window.location.search).get(nome) || '';
  } catch (e) {
    return '';
  }
}

async function reportResult(totalAcertos, totalPerguntas){
  const cpf = pegarParam('cpf');
  const cursoId = pegarParam('cursoId');
  if (!cpf || !cursoId) {
    console.error('[cabana-quiz-tracker] a URL desta página não tem "cpf" e "cursoId" — ela precisa ser aberta a partir da Home da Cabana School, não direto pelo link do arquivo.');
    return { ok: false, erro: 'sem_cpf_ou_curso' };
  }

  const total = Number(totalPerguntas) || 0;
  const acertos = Number(totalAcertos) || 0;
  const nota = total > 0 ? Math.round((acertos / total) * 100) : 0;

  try {
    await garantirAuth();

    const cursoRef = doc(db, 'cursos', cursoId);
    const cursoSnap = await getDoc(cursoRef);
    const cursoData = cursoSnap.exists() ? cursoSnap.data() : {};
    const notaAprovacao = (cursoData.NotaAprovacao != null) ? cursoData.NotaAprovacao : 70;
    const aprovado = nota >= notaAprovacao;

    const progressoRef = doc(db, 'progresso', `${cpf}_${cursoId}`);
    const existenteSnap = await getDoc(progressoRef);
    const existente = existenteSnap.exists() ? existenteSnap.data() : null;
    const tentativasAnteriores = (existente && existente.Tentativas) || 0;

    await setDoc(progressoRef, {
      Cpf: cpf,
      CursoId: cursoId,
      CursoTitulo: cursoData.Titulo || (existente && existente.CursoTitulo) || '',
      Status: aprovado ? 'concluido' : 'reprovado',
      IniciadoEm: (existente && existente.IniciadoEm) || serverTimestamp(),
      ConcluidoEm: aprovado ? serverTimestamp() : ((existente && existente.ConcluidoEm) || null),
      UltimaNota: nota,
      Tentativas: tentativasAnteriores + 1,
    }, { merge: true });

    return { ok: true, aprovado, nota, notaAprovacao };
  } catch (e) {
    console.error('[cabana-quiz-tracker] falha ao gravar o resultado no Firestore:', e);
    return { ok: false, erro: String((e && e.message) || e) };
  }
}

window.CabanaSchool = window.CabanaSchool || {};
window.CabanaSchool.reportResult = reportResult;
