import { h } from '../../utils/dom.js';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { ROTULO_ESPORTE } from './textos.js';

export const horaDoInicio =(a) => {
  const ms = a.inicio?.toMillis?.();
  return Number.isFinite(ms) ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : null;
};

/** Modal para escolher entre as atividades de um dia. Fecha com Esc, clicando fora ou ao escolher uma. */
function modalDeEscolha(data, atividades) {
  const dialogo = h('dialog', { class: 'modal-dia', 'aria-labelledby': 'modal-dia-titulo' });
  const fechar = () => {
    dialogo.close();
  };
  const botaoFechar = h('button', { class: 'modal-dia-fechar', type: 'button', 'aria-label': 'Fechar' }, '×');
  botaoFechar.addEventListener('click', fechar);

  const itens = atividades.map((a) => {
    const hora = horaDoInicio(a);
    const detalhes = [
      hora ? `às ${hora}` : null,
      a.distanciaM ? formatarDistancia(a.distanciaM) : null,
      formatarDuracao(a.duracaoS),
      a.hrss === null || a.hrss === undefined ? null : `HRSS ${formatarNumero(a.hrss, 1)}`,
    ].filter(Boolean);
    const link = h(
      'a',
      { class: 'modal-dia-item', href: `#/atividades/${a.id}` },
      h('strong', null, ROTULO_ESPORTE[a.esporte] ?? a.esporte),
      h('span', { class: 'texto-secundario' }, detalhes.join(' · ')),
    );
    link.addEventListener('click', fechar);
    return h('li', null, link);
  });

  dialogo.append(
    h('header', { class: 'modal-dia-topo' }, h('h2', { id: 'modal-dia-titulo' }, `Atividades de ${formatarData(data)}`), botaoFechar),
    h('p', { class: 'texto-secundario' }, 'Escolha qual atividade você quer ver.'),
    h('ul', { class: 'modal-dia-lista' }, itens),
  );
  // clique no fundo escurecido (fora da caixa) fecha
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) fechar();
  });
  dialogo.addEventListener('close', () => dialogo.remove());
  document.body.append(dialogo);
  dialogo.showModal();
}

/**
 * Abre a atividade do dia: uma só vai direto para o detalhe; mais de uma abre um modal para escolher.
 * @returns {boolean} true se o dia tinha atividade (e portanto o clique foi tratado)
 */
export function abrirAtividadeDoDia(data, atividades) {
  const doDia = atividades.filter((a) => a.data === data).sort((a, b) => (a.inicio?.toMillis?.() ?? 0) - (b.inicio?.toMillis?.() ?? 0));
  if (doDia.length === 0) return false;
  if (doDia.length === 1) window.location.hash = `#/atividades/${doDia[0].id}`;
  else modalDeEscolha(data, doDia);
  return true;
}
