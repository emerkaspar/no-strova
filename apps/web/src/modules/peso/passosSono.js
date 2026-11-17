import { formatarSono, resumoDeBemEstar, somarDias } from '@no-strova/domain';
import { intervalsSincronizarBemEstar } from '../../core/functions.js';
import { DIAS_CARREGADOS_BEM_ESTAR, observarBemEstar } from '../../infrastructure/bemEstarRepo.js';import { h } from '../../utils/dom.js';
import { estadoVazio } from '../../utils/estadoVazio.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { cartao } from './cartaoIndicador.js';

const DIAS_NA_TABELA = 14;

/**
 * Seção "Passos e sono" da tela Saúde. Os dados vêm do intervals.icu (Garmin, Huawei Health etc.) e são gravados pela
 * sincronização; a tela só lê. "Atualizar" pede uma sincronização agora (a rotina diária faz o mesmo às 05:00).
 * @returns {{ el: HTMLElement, fechar: () => void }}
 */
export function criarSecaoPassosSono({ sessao, hoje }) {
  let dias = [];
  let carregou = false;
  let atualizando = false;
  let aviso = '';
  const el = h('section', { class: 'card' });

  async function atualizar() {
    atualizando = true;
    aviso = '';
    desenhar();
    try {
      const r = await intervalsSincronizarBemEstar();
      aviso = r?.dias > 0 ? '' : 'O intervals.icu não trouxe passos nem sono dos últimos dias. Confira se o relógio sincroniza com ele.';
    } catch (erro) {
      aviso =
        erro?.code === 'functions/failed-precondition'
          ? 'Conecte o intervals.icu na Configuração para trazer passos e sono.'
          : erro?.code === 'functions/resource-exhausted'
            ? 'Passos e sono foram atualizados há pouco. Tente de novo em alguns minutos.'
            : 'Não foi possível atualizar agora. Tente de novo em instantes.';
    }
    atualizando = false;
    desenhar();
  }

  function desenhar() {
    const r = resumoDeBemEstar(dias, hoje);
    const recentes = [...dias].filter((d) => d.data <= hoje).sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, DIAS_NA_TABELA);
    const botao = h('button', { class: 'btn btn-secundario btn-pequeno', type: 'button', disabled: atualizando, onClick: atualizar }, atualizando ? 'Atualizando…' : 'Atualizar');
    el.replaceChildren(
      h('div', { class: 'bloco-topo' }, h('h2', { class: 'titulo-bloco' }, 'Passos e sono'), botao),
      aviso ? h('p', { class: 'texto-secundario', role: 'status' }, aviso) : null,
      recentes.length === 0
        ? estadoVazio(carregou ? 'Sem passos e sono ainda. Conecte o intervals.icu na Configuração e use "Atualizar" (funciona com Garmin e Huawei Health).' : 'Carregando…')
        : h(
            'div',
            null,
            h(
              'div',
              { class: 'ativ-recordes' },
              cartao({ rotulo: 'Passos', nomeIcone: 'corrida', valor: r.passos ? formatarNumero(r.passos.valor, 0) : '—', nota: r.passos ? `em ${formatarData(r.passos.data)}` : 'Sem dados' }),
              cartao({ rotulo: 'Média de passos (7 dias)', nomeIcone: 'atividades', valor: r.mediaPassos7 === null ? '—' : formatarNumero(r.mediaPassos7, 0), nota: 'Só dos dias com registro' }),
              cartao({ rotulo: 'Sono', nomeIcone: 'lua', valor: r.sono ? formatarSono(r.sono.segundos) : '—', nota: r.sono ? `noite de ${formatarData(r.sono.data)}` : 'Sem dados' }),
              cartao({ rotulo: 'Média de sono (7 dias)', nomeIcone: 'relogio', valor: r.mediaSono7S === null ? '—' : formatarSono(r.mediaSono7S), nota: 'Só dos dias com registro' }),
            ),
            h(
              'div',
              { class: 'tabela-wrap' },
              h(
                'table',
                { class: 'tabela tabela-compacta' },
                h('thead', null, h('tr', null, ...['Data', 'Passos', 'Sono'].map((t) => h('th', { scope: 'col' }, t)))),
                h(
                  'tbody',
                  null,
                  ...recentes.map((d) =>
                    h('tr', null, h('td', null, formatarData(d.data)), h('td', { class: 'celula-hrss' }, d.passos ? formatarNumero(d.passos, 0) : '—'), h('td', null, formatarSono(d.sonoSegundos))),
                  ),
                ),
              ),
            ),
          ),
    );
  }

  desenhar();
  const cancelar = observarBemEstar(
    sessao.uid,
    somarDias(hoje, -DIAS_CARREGADOS_BEM_ESTAR),
    (lista) => {
      dias = lista;
      carregou = true;
      desenhar();
    },
    () => {
      carregou = true;
      aviso = 'Não foi possível carregar passos e sono.';
      desenhar();
    },
  );
  return { el, fechar: cancelar };
}
