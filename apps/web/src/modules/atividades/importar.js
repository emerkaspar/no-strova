import { extensaoDoArquivo, importarArquivo, reprocessar } from '../../application/atividades.js';
import { selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarNumero } from '../../utils/formatters.js';
import { OPCOES_ESPORTE, OPCOES_ZONA, TEXTO_ALERTA } from './textos.js';

/** Painel de importação de .fit/.gpx/.tcx. Os arquivos são processados um de cada vez. */
export function painelImportar({ uid }) {
  const esporte = selecao({
    id: 'imp-esporte',
    rotulo: 'Esporte',
    opcoes: [{ valor: '', rotulo: 'Detectar pelo arquivo' }, ...OPCOES_ESPORTE],
  });
  const entrada = h('input', { id: 'imp-arquivos', type: 'file', accept: '.fit,.gpx,.tcx', multiple: true });
  const lista = h('ul', { class: 'lista-envios', 'aria-live': 'polite' });

  function itemDeEnvio(nome) {
    const status = h('span', { class: 'texto-secundario' }, 'Enviando…');
    const progresso = h('progress', { max: 1, value: 0 });
    const detalhes = h('div', { class: 'envio-detalhes' });
    const li = h('li', { class: 'envio' }, h('strong', null, nome), progresso, status, detalhes);
    lista.append(li);
    return {
      progresso(fracao) {
        progresso.value = fracao;
      },
      ok(resultado) {
        progresso.remove();
        status.className = 'mensagem-ok-texto';
        const hrss = resultado.hrss === null ? 'HRSS não calculado' : `HRSS ${formatarNumero(resultado.hrss, 1)}`;
        status.textContent = `Importado · ${hrss}`;
        detalhes.replaceChildren(
          ...(resultado.alertas ?? []).map((a) => h('small', { class: 'dica' }, TEXTO_ALERTA[a] ?? a)),
        );
      },
      erro(texto) {
        progresso.remove();
        status.className = 'mensagem-erro-texto';
        status.textContent = texto;
      },
      semFc(erro, aoEscolher) {
        progresso.remove();
        status.textContent = erro.message;
        const zona = selecao({ id: `zona-${erro.atividadeId}`, rotulo: 'Zona predominante', opcoes: OPCOES_ZONA, valor: 'Z2' });
        const botao = h('button', { class: 'btn', type: 'button' }, 'Estimar o estresse');
        botao.addEventListener('click', () => aoEscolher(zona.select.value, botao));
        detalhes.replaceChildren(zona.raiz, botao);
      },
    };
  }

  async function processar(arquivo) {
    const item = itemDeEnvio(arquivo.name);
    if (!extensaoDoArquivo(arquivo.name)) {
      item.erro('Formato não aceito. Use .fit, .gpx ou .tcx.');
      return;
    }
    try {
      item.ok(await importarArquivo({ uid, arquivo, esporte: esporte.select.value, aoProgresso: item.progresso }));
    } catch (err) {
      if (err.codigo === 'sem-fc') {
        item.semFc(err, async (zona, botao) => {
          botao.disabled = true;
          try {
            item.ok(
              await reprocessar({
                atividadeId: err.atividadeId,
                extensao: err.extensao,
                esporte: esporte.select.value,
                zona,
              }),
            );
          } catch (e) {
            item.erro(e.message);
          }
        });
      } else {
        item.erro(err.message);
      }
    }
  }

  entrada.addEventListener('change', async () => {
    const arquivos = [...entrada.files];
    entrada.value = '';
    for (const arquivo of arquivos) await processar(arquivo);
  });

  return h(
    'div',
    { class: 'painel' },
    h('h2', null, 'Importar arquivo'),
    h(
      'p',
      { class: 'texto-secundario' },
      'Aceita .fit, .gpx e .tcx de até 15 MB. A data, a duração, a distância, a subida, a FC e as calorias vêm do arquivo.',
    ),
    esporte.raiz,
    h('div', { class: 'campo' }, h('label', { for: 'imp-arquivos' }, 'Arquivos'), entrada),
    lista,
  );
}
