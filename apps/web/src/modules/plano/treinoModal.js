import { configVigenteEm, descreverPasso, estresseDoTreino, formatarSegundos, resumirTreino, somarDias, treinoNaoRealizado } from '@no-strova/domain';
import { salvarTreinoPlanejado } from '../../application/plano.js';
import { desvincularTreino, excluirTreino, pularTreino } from '../../infrastructure/planoRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { abrirModal, confirmar } from '../../utils/modal.js';
import { perfilDoTreino } from '../../utils/perfilTreino.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { baixarFitDoTreino, criarEditor } from './editor.js';

const ESTADOS = {
  planejado: 'Planejado',
  atrasado: 'Não realizado',
  realizado: 'Feito',
  pulado: 'Pulado',
};

/**
 * Modal do treino planejado. Abre em visualização (perfil, resumo, passos, observações) e, pelo botão Editar, troca o corpo
 * para o formulário. Sem `treino` (novo treino), abre direto na edição. Resolve com o aviso de sucesso (ou `undefined`).
 * @param {{
 *   uid: string, treino: any|null, data: string, hoje: string, configs: () => any[], calibracao?: () => any, modelos?: () => any[],
 *   modo?: 'visualizar'|'editar'
 * }} p
 * @returns {Promise<string|undefined>}
 */
export function abrirTreinoModal({ uid, treino, data, hoje, configs, calibracao = () => null, modelos = () => [], modo = 'visualizar' }) {
  return abrirModal({
    classe: 'modal-treino',
    rotulo: treino ? 'Treino' : 'Novo treino',
    fecharNoFundo: Boolean(treino),
    conteudo: (fechar) => {
      const raiz = h('div', { class: 'treino-modal' });

      function visualizar() {
        const estado = treino.status === 'planejado' && treinoNaoRealizado(treino, hoje) ? 'atrasado' : treino.status;
        const passos = treino.passos?.length ? treino.passos : null;
        const resumo = passos ? resumirTreino(passos) : null;
        const hrss = estresseDoTreino(treino, configs(), calibracao());
        const titulo = treino.nomeTreino || `${ROTULO_ESPORTE[treino.esporte] ?? treino.esporte} ${treino.zona}`;
        const duracaoS = resumo ? resumo.duracaoS : Math.round((Number(treino.duracaoMin) || 0) * 60);
        const perfilPassos = passos ?? [{ tipo: 'bloco', papel: 'principal', zona: treino.zona ?? 'Z2', duracaoS: Math.max(60, duracaoS), descricao: null }];
        const mensagem = areaMensagem();
        const numero = (valor, rotulo) => h('div', { class: 'treino-numero' }, h('strong', null, valor), h('span', null, rotulo));

        async function acao(botao, executar, aviso) {
          botao.disabled = true;
          mensagem.limpar();
          try {
            await executar();
            fechar(aviso);
          } catch (err) {
            mensagem.mostrar(err.message || 'Não foi possível concluir a operação.');
            botao.disabled = false;
          }
        }

        const baixar = h('button', { type: 'button', class: 'btn btn-secundario' }, 'Baixar .fit');
        baixar.addEventListener('click', () => {
          mensagem.limpar();
          try {
            const { aviso } = baixarFitDoTreino({
              esporte: treino.esporte,
              zona: treino.zona,
              duracaoMin: treino.duracaoMin,
              passos,
              nomeTreino: treino.nomeTreino,
              config: configVigenteEm(configs(), treino.data),
            });
            mensagem.mostrar(aviso, 'ok');
          } catch (err) {
            mensagem.mostrar(err.message || 'Não foi possível gerar o arquivo.');
          }
        });

        const acoes = [];
        if (treino.status !== 'realizado') {
          const editar = h('button', { type: 'button', class: 'btn' }, 'Editar');
          editar.addEventListener('click', editarForm);
          acoes.push(editar);
        }
        acoes.push(baixar);

        const duplicar = h('button', { type: 'button', class: 'btn btn-secundario' }, 'Duplicar para a próxima semana');
        const destino = somarDias(treino.data, 7);
        duplicar.addEventListener('click', () =>
          acao(
            duplicar,
            () =>
              salvarTreinoPlanejado({
                uid,
                entrada: {
                  esporte: treino.esporte,
                  data: destino,
                  duracaoMin: treino.duracaoMin,
                  zona: treino.zona,
                  estresseManual: treino.estresseManual ?? '',
                  observacoes: treino.observacoes ?? '',
                  ...(passos ? { passos, nomeTreino: treino.nomeTreino, modeloId: treino.modeloId ?? null } : {}),
                },
                configs: configs(),
                calibracao: calibracao(),
              }),
            `Treino duplicado para ${formatarData(destino)}.`,
          ),
        );
        acoes.push(duplicar);

        if (treino.status === 'planejado') {
          const pular = h('button', { type: 'button', class: 'btn btn-secundario' }, 'Marcar como pulado');
          pular.addEventListener('click', () => acao(pular, () => pularTreino(treino.id), 'Treino marcado como pulado.'));
          acoes.push(pular);
        } else {
          const reabrir = h('button', { type: 'button', class: 'btn btn-secundario' }, treino.status === 'realizado' ? 'Desvincular da atividade' : 'Voltar para planejado');
          reabrir.addEventListener('click', () => acao(reabrir, () => desvincularTreino(treino.id), 'Treino voltou para planejado.'));
          acoes.push(reabrir);
        }

        const excluir = h('button', { type: 'button', class: 'btn btn-perigo' }, 'Excluir');
        excluir.addEventListener('click', async () => {
          if (!(await confirmar({ titulo: 'Excluir este treino?', mensagem: 'Ele sai do plano e da projeção.', confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
          acao(excluir, () => excluirTreino(treino.id), 'Treino excluído.');
        });
        acoes.push(excluir);

        const fecharBtn = h('button', { type: 'button', class: 'treino-modal-fechar', 'aria-label': 'Fechar', title: 'Fechar' }, icone('fechar', 18));
        fecharBtn.addEventListener('click', () => fechar(undefined));

        raiz.replaceChildren(
          h(
            'header',
            { class: 'treino-modal-topo' },
            h(
              'div',
              null,
              h('p', { class: 'cg-mini-rotulo' }, `${ROTULO_ESPORTE[treino.esporte] ?? treino.esporte} · ${formatarData(treino.data)}`),
              h('h2', null, titulo),
            ),
            h('span', { class: `treino-estado treino-estado-${estado}` }, ESTADOS[estado] ?? estado),
            fecharBtn,
          ),
          h('div', { class: 'treino-modal-perfil' }, perfilDoTreino(perfilPassos, { altura: 120 })),
          h(
            'div',
            { class: 'treino-numeros' },
            numero(formatarSegundos(duracaoS), 'duração'),
            numero(resumo?.zona ?? treino.zona ?? '—', 'zona'),
            numero(Number.isFinite(hrss) && hrss > 0 ? `~${formatarNumero(hrss, 0)}` : '—', 'HRSS'),
          ),
          passos ? h('ul', { class: 'treino-estrutura-passos' }, ...passos.map((p) => h('li', null, descreverPasso(p)))) : h('p', { class: 'texto-secundario' }, `Treino livre: ${treino.duracaoMin} min na ${treino.zona}.`),
          treino.observacoes ? h('p', { class: 'treino-obs' }, treino.observacoes) : null,
          mensagem.el,
          h('div', { class: 'linha-botoes' }, ...acoes),
        );
        (raiz.querySelector('.linha-botoes .btn') ?? fecharBtn).focus();
      }

      function editarForm() {
        const form = criarEditor({
          uid,
          configs,
          calibracao,
          modelos,
          treino,
          dataInicial: data,
          aoConcluir: (aviso) => fechar(aviso),
          aoCancelar: () => (treino ? visualizar() : fechar(undefined)),
        });
        raiz.replaceChildren(h('h2', null, treino ? 'Editar treino' : 'Novo treino'), form);
        raiz.querySelector('input, select, textarea')?.focus();
      }

      if (treino && modo === 'visualizar') visualizar();
      else editarForm();
      return raiz;
    },
  });
}
