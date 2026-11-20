/**
 * ==========================================================================
 * SOLÉRIA SAAS — EDITOR DE TEXTO FORMATADO (RICH TEXT / WYSIWYG)
 * Permite negrito, itálico, sublinhado, subtítulos e listas na descrição
 * de produtos, sincronizando transparentemente com o textarea original.
 * ==========================================================================
 */

(function () {
  'use strict';

  function initRichEditor() {
    const editor = document.getElementById('prod-description-editor');
    const textarea = document.getElementById('prod-description');
    const toolbar = document.querySelector('.rich-editor-toolbar');

    if (!editor || !textarea) return;

    // Sincroniza o conteúdo do editor para o textarea oculto
    function syncToTextarea() {
      // Se tiver apenas espaços ou quebras vazias, zera o valor
      const cleanHtml = editor.innerHTML.trim();
      if (cleanHtml === '<p><br></p>' || cleanHtml === '<br>' || cleanHtml === '') {
        textarea.value = '';
      } else {
        textarea.value = cleanHtml;
      }
      // Dispara evento change no textarea para compatibilidade com ouvintes
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Inicializa o conteúdo inicial do textarea no editor (se já tiver)
    if (textarea.value && textarea.value.trim() && !editor.innerHTML.trim()) {
      window.setRichEditorContent(textarea.value);
    }

    // Eventos de digitação e edição
    editor.addEventListener('input', syncToTextarea);
    editor.addEventListener('blur', syncToTextarea);
    editor.addEventListener('keyup', syncToTextarea);

    // Sanitização suave no colar (Paste) para manter quebras e texto limpo sem estilos externos estranhos
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (text) {
        // Converte quebras de linha em tags <p> ou <br>
        const formatted = text
          .split(/\r?\n\r?\n/)
          .map(block => `<p>${block.replace(/\r?\n/g, '<br>')}</p>`)
          .join('');
        document.execCommand('insertHTML', false, formatted);
        syncToTextarea();
      }
    });

    // Ações dos botões da Toolbar
    if (toolbar) {
      toolbar.querySelectorAll('.rich-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          // Previne que o clique no botão tire o foco da seleção do texto
          e.preventDefault();
        });

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const cmd = btn.dataset.cmd;
          const val = btn.dataset.val || null;

          if (!cmd) return;

          editor.focus();

          if (cmd === 'formatBlock') {
            document.execCommand('formatBlock', false, val);
          } else {
            document.execCommand(cmd, false, val);
          }

          syncToTextarea();
          updateToolbarState();
        });
      });

      // Atualiza o estado ativo dos botões da barra conforme a seleção do cursor
      function updateToolbarState() {
        toolbar.querySelectorAll('.rich-btn[data-cmd]').forEach(btn => {
          const cmd = btn.dataset.cmd;
          if (['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].includes(cmd)) {
            if (document.queryCommandState(cmd)) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          }
        });
      }

      document.addEventListener('selectionchange', () => {
        if (document.activeElement === editor) {
          updateToolbarState();
        }
      });
    }
  }

  // API Global para setar e obter conteúdo programaticamente
  window.setRichEditorContent = function (content) {
    const editor = document.getElementById('prod-description-editor');
    const textarea = document.getElementById('prod-description');
    if (!editor) return;

    const raw = String(content || '').trim();

    if (!raw) {
      editor.innerHTML = '';
      if (textarea) textarea.value = '';
      return;
    }

    // Se já é HTML formatado (possui tags)
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      editor.innerHTML = raw;
    } else {
      // Se for texto puro com quebras de linha \n (ex: importado ou produtos antigos)
      editor.innerHTML = raw
        .split(/\r?\n\r?\n/)
        .map(block => `<p>${block.replace(/\r?\n/g, '<br>')}</p>`)
        .join('');
    }

    if (textarea) {
      textarea.value = editor.innerHTML;
    }
  };

  window.getRichEditorContent = function () {
    const editor = document.getElementById('prod-description-editor');
    return editor ? editor.innerHTML : '';
  };

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRichEditor);
  } else {
    initRichEditor();
  }
})();
