import { excluirPesagem, idDaPesagem } from '../../infrastructure/pesoRepo.js';
import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { confirmar } from '../../utils/modal.js';

const POR_PAGINA = 12;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const rotuloDoMes = (chave) => {
  const [a, m] = chave.split('-');
  return `${MESES[Number(m) - 1]} de ${a}`;
};

/**
 * Histórico de pesagens: recolhido, agrupado por mês e paginado (12 por vez, com "Ver mais"), para continuar leve com anos de
 * registro. Cada linha mostra a variação em relação à pesagem anterior e permite excluir (com confirmação).
 * @returns {{ el: HTMLElement, atualizar: (pesagens: any[], carregou: boolean) => void }}
 */
export function criarHistoricoDePesagens({ uid, aoErro }) {
  let pesagens = [];
  let carregou = false;
  let visiveis = POR_PAGINA;
  let aberto = false;
  const el = h('section', { class: 'card' });

  async function excluir(p) {
    const ok = await confirmar({ titulo: 'Excluir esta pesagem?', mensagem: `A pesagem de ${formatarData(p.data)} (${formatarNumero(p.pesoKg, 1)} kg) será apagada e não poderá ser recuperada.`, confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' });
    if (!ok) return;
    excluirPesagem(p.id ?? idDaPesagem(uid, p.data)).catch(() => aoErro?.('Não foi possível excluir a pesagem.'));
  }

  function desenhar() {
    const crescente = [...pesagens].sort((a, b) => (a.data < b.data ? -1 : 1));
    const variacao = new Map(crescente.map((p, i) => [p.data, i > 0 ? p.pesoKg - crescente[i - 1].pesoKg : null]));
    const lista = [...crescente].reverse();
    const recorte = lista.slice(0, visiveis);

    // agrupa por mês, mantendo a ordem (mais recente primeiro)
    const meses = [];
    for (const p of recorte) {
      const chave = p.data.slice(0, 7);
      const ultimo = meses[meses.length - 1];
      if (ultimo?.chave === chave) ultimo.itens.push(p);
      else meses.push({ chave, itens: [p] });
    }

    const linha = (p) => {
      const v = variacao.get(p.data);
      const texto = v === null || v === undefined || Math.abs(v) < 0.05 ? '' : `${v > 0 ? '+' : '−'}${formatarNumero(Math.abs(v), 1)} kg`;
      return h(
        'li',
        { class: 'peso-hist-linha' },
        h('span', { class: 'peso-hist-data' }, formatarData(p.data).slice(0, 5)),
        h('strong', { class: 'peso-hist-valor' }, `${formatarNumero(p.pesoKg, 1)} kg`),
        h('span', { class: 'peso-hist-var texto-secundario' }, texto),
        h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', 'aria-label': `Excluir a pesagem de ${formatarData(p.data)}`, onClick: () => excluir(p) }, 'Excluir'),
      );
    };

    const detalhes = h(
      'details',
      { class: 'peso-detalhes peso-hist', ...(aberto ? { open: true } : {}) },
      h('summary', null, `Histórico de pesagens${lista.length ? ` (${lista.length})` : ''}`),
      lista.length === 0
        ? estadoVazio(carregou ? 'Nenhuma pesagem ainda.' : 'Carregando…')
        : h(
            'div',
            { class: 'peso-hist-corpo' },
            ...meses.map((m) =>
              h('div', { class: 'peso-hist-mes' }, h('h3', { class: 'peso-hist-titulo' }, rotuloDoMes(m.chave)), h('ul', { class: 'peso-hist-lista' }, ...m.itens.map(linha))),
            ),
            lista.length > visiveis
              ? h(
                  'button',
                  {
                    class: 'btn btn-secundario btn-pequeno',
                    type: 'button',
                    onClick: () => {
                      visiveis += POR_PAGINA;
                      aberto = true;
                      desenhar();
                    },
                  },
                  `Ver mais ${Math.min(POR_PAGINA, lista.length - visiveis)} (mostrando ${visiveis} de ${lista.length})`,
                )
              : null,
          ),
    );
    detalhes.addEventListener('toggle', () => {
      aberto = detalhes.open;
    });
    el.replaceChildren(detalhes);
  }

  desenhar();
  return {
    el,
    atualizar(novas, jaCarregou) {
      pesagens = novas;
      carregou = jaCarregou;
      desenhar();
    },
  };
}
