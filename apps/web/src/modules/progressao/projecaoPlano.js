import { observarCalibracaoDoUsuario } from '../../application/calibracao.js';
import { modelosProprios } from '../../application/modelos.js';
import { dataInicialDoHistorico, montarProjecao } from '../../application/plano.js';
import { observarAtividadesDesde } from '../../infrastructure/atividadesRepo.js';
import { observarConfigs } from '../../infrastructure/configsRepo.js';
import { observarEstresseDiario } from '../../infrastructure/estresseRepo.js';
import { observarModelos } from '../../infrastructure/modelosRepo.js';
import { observarMetas, observarMetasCondicionamento, observarTreinos } from '../../infrastructure/planoRepo.js';
import { areaMensagem } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { abrirAtividadeDoDia } from '../atividades/abrirDoDia.js';
import { criarPrevistoDoDia, criarTreinoDoDia } from '../inicio/treinoDoDia.js';
import { abrirTreinoModal } from '../plano/treinoModal.js';
import { criarCartaoProjecao } from '../plano/projecao.js';

/**
 * Bloco "Projeção do plano" no topo da Progressão: o gráfico de Condicionamento, Fadiga, Forma e esforço do dia com o
 * plano projetado. Tem os próprios listeners e o próprio elemento, porque a Progressão redesenha a página inteira a
 * cada dado novo e o gráfico não deve ser refeito junto. Clicar num dia abre a atividade ou o treino daquele dia.
 * As metas continuam sendo criadas e editadas no Plano; aqui só aparecem marcadas no gráfico.
 * @returns {{ el: HTMLElement, destruir: () => void }}
 */
export function criarBlocoProjecao({ uid, hoje }) {
  const desde = dataInicialDoHistorico(hoje);
  const dados = { dias: [], treinos: [], atividades: [], configs: [], metas: [], metasCondicionamento: [], modelos: [], calibracao: null };
  const carregou = { dias: false, treinos: false, atividades: false, configs: false, metas: false, metasCondicionamento: false, modelos: false, calibracao: false };
  let ativo = true;

  const mensagem = areaMensagem();
  const corpo = h('div');
  const el = h('div', { class: 'pilha', id: 'prog-projecao' }, mensagem.el, corpo);
  const treinoDoDia = criarTreinoDoDia(dados, hoje);
  const previstoDoDia = criarPrevistoDoDia(dados);

  async function abrirEditor(treino, data) {
    mensagem.limpar();
    const texto = await abrirTreinoModal({
      uid,
      treino,
      data,
      hoje,
      configs: () => dados.configs,
      calibracao: () => dados.calibracao,
      modelos: () => modelosProprios(dados.modelos),
      modo: treino ? 'visualizar' : 'editar',
    });
    if (texto) mensagem.mostrar(texto, 'ok');
  }

  const ativaMaisProxima = (lista) => lista.filter((m) => m.ativa).sort((a, b) => (a.dataAlvo < b.dataAlvo ? -1 : 1))[0] ?? null;

  function desenhar() {
    if (!ativo) return;
    if (!Object.values(carregou).every(Boolean)) {
      corpo.replaceChildren(h('p', { class: 'vazio', role: 'status' }, 'Carregando…'));
      return;
    }
    const metaAtiva = ativaMaisProxima(dados.metas);
    const metaCondAtiva = ativaMaisProxima(dados.metasCondicionamento);
    const { serie, avaliacao, avaliacaoCondicionamento } = montarProjecao({
      dias: dados.dias,
      treinos: dados.treinos,
      configs: dados.configs,
      meta: metaAtiva,
      metaCondicionamento: metaCondAtiva,
      hoje,
      calibracao: dados.calibracao,
    });
    corpo.replaceChildren(
      criarCartaoProjecao({
        serie,
        hoje,
        meta: metaAtiva,
        avaliacao,
        metaCondicionamento: metaCondAtiva,
        avaliacaoCondicionamento,
        treinoDoDia,
        previstoDoDia,
        aoClicarDia: (data) => {
          if (abrirAtividadeDoDia(data, dados.atividades)) return;
          abrirEditor(dados.treinos.find((t) => t.data === data && t.status === 'planejado') ?? null, data);
        },
      }),
    );
  }

  const aoErro = (err) => {
    console.error('Projeção do plano: falha ao carregar os dados', err);
    mensagem.mostrar('Não foi possível carregar a projeção do plano.');
  };
  const ouvir = (chave, assinar) =>
    assinar((lista) => {
      dados[chave] = lista;
      carregou[chave] = true;
      desenhar();
    });
  const cancelar = [
    ouvir('dias', (cb) => observarEstresseDiario(uid, cb, aoErro)),
    ouvir('treinos', (cb) => observarTreinos(uid, desde, cb, aoErro)),
    ouvir('atividades', (cb) => observarAtividadesDesde(uid, desde, cb, aoErro)),
    ouvir('configs', (cb) => observarConfigs(uid, cb, aoErro)),
    ouvir('metas', (cb) => observarMetas(uid, cb, aoErro)),
    ouvir('metasCondicionamento', (cb) => observarMetasCondicionamento(uid, cb, aoErro)),
    ouvir('modelos', (cb) => observarModelos(uid, cb, aoErro)),
    observarCalibracaoDoUsuario(uid, ({ efetiva }) => {
      dados.calibracao = efetiva;
      carregou.calibracao = true;
      desenhar();
    }),
  ];
  desenhar();

  return {
    el,
    destruir() {
      ativo = false;
      cancelar.forEach((fn) => fn());
    },
  };
}
