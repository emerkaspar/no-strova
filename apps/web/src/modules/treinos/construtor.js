import {
  estimarEstresseEstruturado,
  ESPORTES_TREINO,
  FOCOS,
  formatarSegundos,
  NIVEIS,
  PAPEIS_DO_BLOCO,
  resumirTreino,
  validarPassos,
} from '@no-strova/domain';
import { salvarModeloProprio } from '../../application/treinos.js';
import { areaMensagem, executarComBotao } from '../../utils/componentes.js';
import { seletor } from '../../utils/listaSuspensa.js';
import { h } from '../../utils/dom.js';
import { lerDuracao, textoDeDuracao } from '../../utils/duracao.js';
import { formatarNumero } from '../../utils/formatters.js';
import { perfilDoTreino } from '../../utils/perfilTreino.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';

const ROTULO_PAPEL = { aquecimento: 'Aquecimento', principal: 'Principal', recuperacao: 'Recuperação', desaquecimento: 'Volta à calma' };
const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

const copia = (x) => JSON.parse(JSON.stringify(x));

/** Treino inicial do construtor: aquecimento, 5 × 3 min no VO2 e volta à calma. */
function treinoInicial() {
  return [
    { tipo: 'bloco', papel: 'aquecimento', duracaoS: 300, zona: 'Z1' },
    { tipo: 'bloco', papel: 'aquecimento', duracaoS: 300, zona: 'Z2' },
    { tipo: 'serie', repeticoes: 5, esforco: { duracaoS: 180, zona: 'Z5' }, recuperacao: { duracaoS: 180, zona: 'Z1' } },
    { tipo: 'bloco', papel: 'desaquecimento', duracaoS: 480, zona: 'Z1' },
  ];
}

const opcoes = (valores, rotulos = {}) => valores.map((v) => ({ valor: v, rotulo: rotulos[v] ?? v }));

/**
 * Construtor de treinos intervalados próprios. Com \`base\` de outro usuário ou do catálogo, abre uma cópia para editar;
 * com um treino próprio, edita o dele.
 * @param {{
 *   uid: string, base: any|null, config: any|null, esporteInicial: string,
 *   aoSalvar: (id: string) => void, aoCancelar: () => void
 * }} p
 */
export function criarConstrutor({ uid, base, config, esporteInicial, aoSalvar, aoCancelar }) {
  const editando = base?.origem === 'proprio' ? base : null;
  const rascunho = {
    nome: editando ? base.nome : base ? `${base.nome} (meu)` : '',
    esporte: base?.esporte ?? esporteInicial,
    foco: base?.foco ?? 'vo2max',
    nivel: base?.nivel ?? 'intermediario',
    descricao: base?.descricao ?? '',
    passos: base ? copia(base.passos) : treinoInicial(),
  };

  const mensagem = areaMensagem();
  const previa = h('div', { class: 'construtor-previa' });
  const listaPassos = h('div', { class: 'construtor-passos' });

  function atualizarPrevia() {
    const v = validarPassos(rascunho.passos);
    if (!v.valido) {
      previa.replaceChildren(h('p', { class: 'texto-secundario' }, v.erros[0]));
      return;
    }
    const r = resumirTreino(v.passos);
    const hrss = estimarEstresseEstruturado({ passos: v.passos, config });
    previa.replaceChildren(
      perfilDoTreino(v.passos, { altura: 80 }),
      h('p', { class: 'treino-resumo' }, `${formatarSegundos(r.duracaoS)} · zona principal ${r.zona} · ${r.esforcos} esforço${r.esforcos === 1 ? '' : 's'} · ${hrss === null ? 'HRSS sem configuração de FC' : `~${formatarNumero(hrss, 0)} de HRSS`}`),
    );
  }

  /** Campo de duração: lê "30s", "3", "2:30"… e guarda em segundos no objeto. */
  function campoDuracao(objeto, rotulo) {
    const input = h('input', { type: 'text', value: textoDeDuracao(objeto.duracaoS), 'aria-label': rotulo, inputmode: 'text', size: 7 });
    input.addEventListener('input', () => {
      objeto.duracaoS = lerDuracao(input.value) ?? Number.NaN;
      atualizarPrevia();
    });
    return input;
  }

  function campoZona(objeto, rotulo) {
    const select = seletor({ rotulo, opcoes: opcoes(ZONAS), valor: objeto.zona });
    select.addEventListener('change', () => {
      objeto.zona = select.value;
      atualizarPrevia();
    });
    return select;
  }

  function campoTexto(objeto, rotulo) {
    const input = h('input', { type: 'text', value: objeto.descricao ?? '', 'aria-label': rotulo, placeholder: 'Descrição (opcional)', maxlength: 120 });
    input.addEventListener('input', () => {
      if (input.value.trim()) objeto.descricao = input.value;
      else delete objeto.descricao;
    });
    return input;
  }

  function linhaDoPasso(passo, i) {
    const controles = h(
      'div',
      { class: 'construtor-controles' },
      h('button', { class: 'btn btn-secundario', type: 'button', 'aria-label': `Subir o passo ${i + 1}`, disabled: i === 0, onClick: () => mover(i, -1) }, '↑'),
      h('button', { class: 'btn btn-secundario', type: 'button', 'aria-label': `Descer o passo ${i + 1}`, disabled: i === rascunho.passos.length - 1, onClick: () => mover(i, 1) }, '↓'),
      h('button', { class: 'btn btn-secundario', type: 'button', 'aria-label': `Remover o passo ${i + 1}`, onClick: () => remover(i) }, '✕'),
    );
    if (passo.tipo === 'serie') {
      const reps = h('input', { type: 'number', min: 1, max: 50, value: passo.repeticoes, 'aria-label': `Repetições do passo ${i + 1}`, size: 3 });
      reps.addEventListener('input', () => {
        passo.repeticoes = Number(reps.value);
        atualizarPrevia();
      });
      return h(
        'div',
        { class: 'construtor-passo construtor-serie' },
        h('strong', null, `${i + 1}. Série`),
        h(
          'div',
          { class: 'construtor-campos' },
          h('label', null, 'Repetições ', reps),
          h('span', { class: 'construtor-sub' }, 'Esforço'),
          campoDuracao(passo.esforco, `Duração do esforço do passo ${i + 1}`),
          campoZona(passo.esforco, `Zona do esforço do passo ${i + 1}`),
          campoTexto(passo.esforco, `Descrição do esforço do passo ${i + 1}`),
          h('span', { class: 'construtor-sub' }, 'Recuperação'),
          campoDuracao(passo.recuperacao, `Duração da recuperação do passo ${i + 1}`),
          campoZona(passo.recuperacao, `Zona da recuperação do passo ${i + 1}`),
        ),
        controles,
      );
    }
    const papel = seletor({ rotulo: `Tipo do passo ${i + 1}`, opcoes: opcoes(PAPEIS_DO_BLOCO, ROTULO_PAPEL), valor: passo.papel });
    papel.addEventListener('change', () => {
      passo.papel = papel.value;
      atualizarPrevia();
    });
    return h(
      'div',
      { class: 'construtor-passo' },
      h('strong', null, `${i + 1}. Bloco`),
      h('div', { class: 'construtor-campos' }, papel, campoDuracao(passo, `Duração do passo ${i + 1}`), campoZona(passo, `Zona do passo ${i + 1}`), campoTexto(passo, `Descrição do passo ${i + 1}`)),
      controles,
    );
  }

  function desenharPassos() {
    listaPassos.replaceChildren(...rascunho.passos.map(linhaDoPasso));
    atualizarPrevia();
  }
  function mover(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= rascunho.passos.length) return;
    [rascunho.passos[i], rascunho.passos[j]] = [rascunho.passos[j], rascunho.passos[i]];
    desenharPassos();
  }
  function remover(i) {
    rascunho.passos.splice(i, 1);
    desenharPassos();
  }
  const adicionar = (passo) => {
    rascunho.passos.push(passo);
    desenharPassos();
  };

  // ---- dados gerais ----
  const nome = h('input', { id: 'tm-nome', type: 'text', value: rascunho.nome, maxlength: 60, placeholder: 'Ex.: 6 × 4 min no limiar' });
  nome.addEventListener('input', () => (rascunho.nome = nome.value));
  const esporte = seletor({ id: 'tm-esporte', rotulo: 'Esporte', opcoes: opcoes(ESPORTES_TREINO, ROTULO_ESPORTE), valor: rascunho.esporte });
  esporte.addEventListener('change', () => (rascunho.esporte = esporte.value));
  const foco = seletor({ id: 'tm-foco', rotulo: 'Foco', opcoes: opcoes(Object.keys(FOCOS), Object.fromEntries(Object.entries(FOCOS).map(([k, v]) => [k, v.rotulo]))), valor: rascunho.foco });
  foco.addEventListener('change', () => (rascunho.foco = foco.value));
  const nivel = seletor({ id: 'tm-nivel', rotulo: 'Nível', opcoes: opcoes(Object.keys(NIVEIS), NIVEIS), valor: rascunho.nivel });
  nivel.addEventListener('change', () => (rascunho.nivel = nivel.value));
  const descricao = h('textarea', { id: 'tm-descricao', rows: 3, maxlength: 500, placeholder: 'Como executar, o que sentir…' });
  descricao.value = rascunho.descricao;
  descricao.addEventListener('input', () => (rascunho.descricao = descricao.value));
  const campoDe = (rotulo, id, controle) => h('div', { class: 'campo' }, h('label', { for: id }, rotulo), controle);

  const botao = h('button', { class: 'btn', type: 'submit' }, editando ? 'Salvar alterações' : 'Salvar treino');
  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          const id = await salvarModeloProprio({ uid, id: editando?.id, entrada: rascunho });
          aoSalvar(id);
        });
      },
    },
    h('div', { class: 'grid' }, campoDe('Nome', 'tm-nome', nome), campoDe('Esporte', 'tm-esporte', esporte), campoDe('Foco', 'tm-foco', foco), campoDe('Nível', 'tm-nivel', nivel)),
    campoDe('Descrição (opcional)', 'tm-descricao', descricao),
    h('h3', { class: 'cg-subtitulo' }, 'Passos'),
    h('p', { class: 'texto-secundario' }, 'Digite a duração como "30s", "3" (minutos), "2:30" ou "1h". A recuperação de uma série vem entre as repetições, não depois da última.'),
    listaPassos,
    h(
      'div',
      { class: 'linha-botoes' },
      h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => adicionar({ tipo: 'bloco', papel: 'principal', duracaoS: 600, zona: 'Z3' }) }, '+ Bloco'),
      h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => adicionar({ tipo: 'serie', repeticoes: 4, esforco: { duracaoS: 120, zona: 'Z4' }, recuperacao: { duracaoS: 120, zona: 'Z1' } }) }, '+ Série'),
    ),
    h('h3', { class: 'cg-subtitulo' }, 'Prévia'),
    previa,
    mensagem.el,
    h('div', { class: 'linha-botoes' }, botao, h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoCancelar }, 'Cancelar')),
  );
  desenharPassos();

  return h('section', { class: 'card', id: 'construtor-treino' }, h('h2', null, editando ? 'Editar treino' : base ? 'Novo treino a partir de um modelo' : 'Novo treino'), form);
}
