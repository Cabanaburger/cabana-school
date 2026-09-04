// cabana-scroll-gate.js — Cabana School
//
// Motor genérico e reutilizável pra travar o botão de concluir treinamento de um curso HTML
// SEM PROVA (upload direto, tipo "html") até a pessoa realmente rolar até o fim de cada seção
// do conteúdo e (opcionalmente) clicar em interações obrigatórias marcadas pelo autor do curso.
// É a versão "forte" da trava de 15 segundos que já existe pra link externo de terceiro — só
// dá pra ir mais longe aqui porque o arquivo é da própria Cabana Burger, então o próprio HTML
// pode medir rolagem e clique de verdade (num site de terceiro isso não seria possível).
//
// COMO USAR NUM CURSO NOVO (arquivo HTML que vai ser cadastrado no admin como
// "📄 Upload de curso (HTML)") — normalmente feito automaticamente pelo `injetor-trava-rolagem.html`,
// não à mão (ver contrato de integração). Referência de como funciona por baixo dos panos:
//
//   1. Marque o fim de cada seção que precisa ser lida com um marcador invisível logo antes de
//      fechar a seção — mesmo padrão já usado no curso "De Olho no Padrão":
//        <div class="section-end" data-end="algum-id-unico" data-cabana-titulo="Nome da seção"></div>
//      (o atributo `data-cabana-titulo` é opcional — só usado pra deixar a dica de progresso
//      mais legível; sem ele, a dica usa "Seção N".)
//      O navegador só considera essa seção "lida" quando a pessoa rola até esse ponto — passar
//      o olho rápido pelo topo da seção não conta.
//
//   2. (Opcional) marque cliques obrigatórios — abrir um vídeo, expandir um checklist, abrir uma
//      foto, o que fizer sentido pro conteúdo — com o atributo `data-cabana-clique` em qualquer
//      elemento clicável (id único por elemento; `data-cabana-titulo` também opcional aqui):
//        <button data-cabana-clique="abriu-video-1" data-cabana-titulo="Assistir vídeo">Assistir vídeo</button>
//
//   3. Dê um id ao botão de concluir e deixe ele desabilitado por padrão no HTML:
//        <button id="btnConcluirTreinamento" disabled>Concluir treinamento</button>
//
//   4. (Opcional) um elemento de texto pra mostrar o que falta:
//        <p id="cabanaGateProgresso"></p>
//
//   5. Antes do </body>, junto com a Forma A do contrato de integração (cabana-quiz-tracker.js):
//        <script src="https://cabanaburger.github.io/cabana-school/assets/cabana-scroll-gate.js"></script>
//        <script type="module" src="https://cabanaburger.github.io/cabana-school/assets/cabana-quiz-tracker.js"></script>
//        <script>
//          CabanaGate.iniciar({
//            botao: 'btnConcluirTreinamento',
//            elementoDica: 'cabanaGateProgresso', // opcional
//          });
//        </script>
//
// O QUE ACONTECE: o botão fica desabilitado até (a) toda seção marcada com `.section-end` ter
// sido vista até o fim e (b) todo clique obrigatório marcado já ter acontecido pelo menos uma
// vez. Assim que os dois estão completos, o botão libera sozinho. Ao clicar nele, o motor chama
// `window.CabanaSchool.reportResult(1, 1)` — a mesma função que qualquer prova da Cabana School
// já usa (ver contrato de integração, Forma A) — só que aqui não existe "nota": é sempre 100%,
// porque esse tipo de curso não mede acerto de pergunta, só se a pessoa passou pelo conteúdo
// inteiro. Por isso, cadastre esse curso no admin com "Este curso tem prova?" = Sim e a nota
// mínima em 100 (ou qualquer valor ≤ 100 — sempre vai bater) — sem isso marcado, a Home trata
// como conclusão manual comum e ignora esse fluxo.
//
// ⚠ Detecção de rolagem híbrida, de propósito: usa IntersectionObserver como método principal,
// mas também recalcula a posição de cada marcador manualmente (getBoundingClientRect) a cada
// evento de rolagem/redimensionamento — inclusive rolagem que aconteça dentro de um contêiner
// aninhado, não só a página inteira (o listener de "scroll" é registrado com `capture:true`,
// que pega esse evento em qualquer elemento da página, não só na janela) — e ainda roda uma
// checagem de segurança a cada meio segundo nos primeiros 20 segundos. Isso existe porque
// prévias/visualizações embutidas (como quando este arquivo é aberto dentro de uma ferramenta
// de preview, e não direto no navegador) às vezes rolam de um jeito que o IntersectionObserver
// sozinho não pega — a checagem redundante garante que o progresso conta certo em qualquer
// ambiente onde o arquivo for aberto, não só no navegador comum.
//
// ⚠ Ressalva importante (documentada também no contrato, pra não vender isso como algo que não
// é): essa trava fecha o problema de comportamento normal — clique por engano, abrir e não
// prestar atenção — de um jeito bem mais forte que os 15 segundos de link externo, porque agora
// dá pra medir rolagem/clique de verdade. Não impede uma fraude deliberada de alguém que abra o
// console do navegador (F12) e chame a função de conclusão na mão, pulando a rolagem inteira —
// mas essa limitação já existe hoje em qualquer prova de verdade da plataforma também.
//
// O progresso (seções vistas, cliques feitos, se já foi enviado) fica salvo em localStorage,
// numa chave por curso (lida do `cursoId` da própria URL) — sobrevive a reload de página, do
// mesmo jeito que a trava de 15s do link externo já precisou aprender a fazer.

(function(){
  function progressoKey(sufixo){
    var cursoId = '';
    try { cursoId = new URLSearchParams(window.location.search).get('cursoId') || ''; } catch(e){}
    return 'cabanaGate_' + sufixo + '_' + (cursoId || 'semCurso');
  }

  function carregarSet(chave){
    try { return new Set(JSON.parse(localStorage.getItem(chave) || '[]')); }
    catch(e){ return new Set(); }
  }
  function salvarSet(chave, set){
    try { localStorage.setItem(chave, JSON.stringify(Array.from(set))); } catch(e){}
  }
  function lerFlag(chave){
    try { return localStorage.getItem(chave) === '1'; } catch(e){ return false; }
  }
  function gravarFlag(chave){
    try { localStorage.setItem(chave, '1'); } catch(e){}
  }

  function mostrarConcluido(){
    try {
      var overlay = document.createElement('div');
      overlay.setAttribute('style', 'position:fixed;inset:0;background:rgba(20,17,13,0.75);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,"Avenir Next",sans-serif;');
      var caixa = document.createElement('div');
      caixa.setAttribute('style', 'background:#FFFDF7;border-radius:18px;max-width:360px;width:100%;padding:30px 26px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.35);');
      caixa.innerHTML =
        '<div style="font-size:42px;margin-bottom:10px;">🎉</div>' +
        '<h2 style="margin:0 0 8px;font-size:19px;color:#1E1A14;font-weight:700;">Treinamento concluído!</h2>' +
        '<p style="margin:0 0 22px;color:#574E3F;font-size:13.5px;line-height:1.5;">Seu progresso já foi enviado pra Cabana School. Pode fechar esta aba.</p>' +
        '<button id="_cabanaGateFechar" style="background:#4F9C40;color:#fff;border:none;border-radius:100px;padding:12px 28px;font-size:13.5px;font-weight:700;cursor:pointer;">Fechar aba</button>';
      overlay.appendChild(caixa);
      document.body.appendChild(overlay);
      var btn = caixa.querySelector('#_cabanaGateFechar');
      if (btn) btn.addEventListener('click', function(){ window.close(); });
    } catch(e){ console.error('[cabana-scroll-gate] erro ao mostrar overlay de conclusão', e); }
  }

  function mostrarErro(msg){
    try { alert(msg || 'Não foi possível registrar sua conclusão agora. Confira sua internet e tente de novo em alguns segundos.'); } catch(e){}
  }

  function iniciar(opcoes){
    opcoes = opcoes || {};
    var botao = document.getElementById(opcoes.botao || 'btnConcluirTreinamento');
    if (!botao) { console.warn('[cabana-scroll-gate] não achei o botão "' + (opcoes.botao || 'btnConcluirTreinamento') + '" — nada pra travar.'); return; }

    var marcos = Array.from(document.querySelectorAll('.section-end[data-end]'));
    var cliqueEls = Array.from(document.querySelectorAll('[data-cabana-clique]'));
    var idsCliqueObrigatorios = (opcoes.cliquesObrigatorios && opcoes.cliquesObrigatorios.length)
      ? opcoes.cliquesObrigatorios.slice()
      : cliqueEls.map(function(el){ return el.getAttribute('data-cabana-clique'); });

    var chaveScroll = progressoKey('scroll');
    var chaveClique = progressoKey('clique');
    var chaveEnviado = progressoKey('enviado');
    var vistos = carregarSet(chaveScroll);
    var clicados = carregarSet(chaveClique);
    var jaEnviado = lerFlag(chaveEnviado);

    function tituloMarco(el, i){
      return el.getAttribute('data-cabana-titulo') || el.getAttribute('data-end') || ('Seção ' + (i + 1));
    }
    function tituloClique(el){
      return el.getAttribute('data-cabana-titulo') || (el.textContent || '').trim().slice(0, 40) || el.getAttribute('data-cabana-clique');
    }

    function progressoTexto(){
      if (marcos.length === 0 && idsCliqueObrigatorios.length === 0) return '';
      var faltamSecoes = marcos.filter(function(el){ return !vistos.has(el.getAttribute('data-end')); });
      var faltamCliques = cliqueEls.filter(function(el){ return !clicados.has(el.getAttribute('data-cabana-clique')); });
      if (!faltamSecoes.length && !faltamCliques.length) return '✅ Tudo pronto — pode concluir.';
      var partes = [];
      if (marcos.length) partes.push('Leitura ' + vistos.size + '/' + marcos.length);
      if (idsCliqueObrigatorios.length) partes.push('Ações ' + clicados.size + '/' + idsCliqueObrigatorios.length);
      var linha = partes.join(' · ');
      var faltantes = faltamSecoes.map(function(el, i){ return tituloMarco(el, marcos.indexOf(el)); })
        .concat(faltamCliques.map(tituloClique));
      if (faltantes.length) linha += ' — falta: ' + faltantes.slice(0, 3).join(', ') + (faltantes.length > 3 ? '…' : '');
      return linha;
    }

    function atualizarDica(){
      var dica = opcoes.elementoDica ? document.getElementById(opcoes.elementoDica) : null;
      if (dica) dica.textContent = progressoTexto();
    }

    function tudoPronto(){
      var okSecoes = marcos.length === 0 || vistos.size >= marcos.length;
      var okCliques = idsCliqueObrigatorios.length === 0 || clicados.size >= idsCliqueObrigatorios.length;
      return okSecoes && okCliques;
    }

    function checar(){
      atualizarDica();
      if (jaEnviado){
        botao.disabled = true;
        botao.textContent = opcoes.textoConcluido || 'Treinamento já concluído ✓';
        return;
      }
      botao.disabled = !tudoPronto();
    }

    // ---- detecção de rolagem: IntersectionObserver (principal) + checagem manual redundante ----
    function marcarVisivelSeEstiver(el){
      var id = el.getAttribute('data-end');
      if (!id || vistos.has(id)) return;
      var r = el.getBoundingClientRect();
      var alturaJanela = window.innerHeight || document.documentElement.clientHeight || 0;
      var larguraJanela = window.innerWidth || document.documentElement.clientWidth || 0;
      var visivel = r.top < alturaJanela && r.bottom > 0 && r.left < larguraJanela && r.right > 0;
      if (visivel){ vistos.add(id); salvarSet(chaveScroll, vistos); checar(); }
    }
    function verificarTodosManualmente(){
      marcos.forEach(marcarVisivelSeEstiver);
    }

    if (marcos.length){
      try {
        var observer = new IntersectionObserver(function(entries){
          entries.forEach(function(entry){
            if (entry.isIntersecting){
              var id = entry.target.getAttribute('data-end');
              if (id && !vistos.has(id)){ vistos.add(id); salvarSet(chaveScroll, vistos); checar(); }
            }
          });
        }, { threshold: 0 });
        marcos.forEach(function(m){ observer.observe(m); });
      } catch(e){ console.warn('[cabana-scroll-gate] IntersectionObserver indisponível, usando só checagem manual', e); }

      // Redundância proposital: escuta rolagem/redimensionamento em qualquer nível da página
      // (capture:true pega o evento mesmo se quem rola for um contêiner interno, não a janela) e
      // ainda roda uma varredura periódica por alguns segundos após carregar — cobre ambientes
      // (como uma prévia embutida) onde o IntersectionObserver sozinho pode não disparar certo.
      window.addEventListener('scroll', verificarTodosManualmente, { capture: true, passive: true });
      window.addEventListener('resize', verificarTodosManualmente, { passive: true });
      document.addEventListener('scroll', verificarTodosManualmente, { capture: true, passive: true });
      var tentativasVarredura = 0;
      var varredura = setInterval(function(){
        verificarTodosManualmente();
        tentativasVarredura++;
        if (tentativasVarredura > 40 || vistos.size >= marcos.length) clearInterval(varredura);
      }, 500);
      // primeira checagem, logo depois do layout inicial se acomodar
      setTimeout(verificarTodosManualmente, 50);
    }

    cliqueEls.forEach(function(el){
      el.addEventListener('click', function(){
        var id = el.getAttribute('data-cabana-clique');
        if (id && !clicados.has(id)){ clicados.add(id); salvarSet(chaveClique, clicados); checar(); }
      });
    });

    botao.addEventListener('click', function(){
      if (botao.disabled || jaEnviado) return;
      botao.disabled = true;
      var textoOriginal = botao.textContent;
      botao.textContent = 'Enviando...';
      var tentativas = 0;
      function tentarEnviar(){
        if (window.CabanaSchool && window.CabanaSchool.reportResult){
          window.CabanaSchool.reportResult(1, 1).then(function(r){
            if (!r || !r.ok){
              mostrarErro();
              botao.disabled = false;
              botao.textContent = textoOriginal;
              return;
            }
            jaEnviado = true;
            gravarFlag(chaveEnviado);
            botao.textContent = opcoes.textoConcluido || 'Treinamento já concluído ✓';
            mostrarConcluido();
          }).catch(function(){
            mostrarErro();
            botao.disabled = false;
            botao.textContent = textoOriginal;
          });
          return;
        }
        // cabana-quiz-tracker.js (carregado como módulo, à parte) pode ainda não ter terminado
        // de expor window.CabanaSchool — tenta de novo por até ~6 segundos antes de desistir.
        tentativas++;
        if (tentativas > 20){
          mostrarErro('A integração com a Cabana School não carregou. Recarregue a página e tente de novo.');
          botao.disabled = false;
          botao.textContent = textoOriginal;
          return;
        }
        setTimeout(tentarEnviar, 300);
      }
      tentarEnviar();
    });

    checar();
  }

  window.CabanaGate = window.CabanaGate || {};
  window.CabanaGate.iniciar = iniciar;
})();
