import { h } from '../../utils/dom.js';
import { criarControlePopover } from '../inicio/semanaPopover.js';
import { ROTULO_ORIGEM_HRSS } from './textos.js';

/**
 * Textos do popover de cada dado do card de atividade. `extras`: `{ condicao?: string, fonte?: { id: string, rotulo: string } }`.
 * @param {string} id distancia, duracao, velocidade, elevacao, fc, potencia, clima, hrss, miniatura ou origem
 * @param {object} a a atividade
 * @param {{ condicao?: string|null, fonte?: { id: string, rotulo: string } }} [extras]
 * @returns {{ titulo: string, paragrafos: string[] }}
 */
export function guiaDoDado(id, a, extras = {}) {
  switch (id) {
    case 'distancia':
      return { titulo: 'Distância', paragrafos: ['A distância total percorrida na atividade.'] };
    case 'duracao':
      return {
        titulo: 'Duração',
        paragrafos: ['O tempo total da atividade, do início ao fim, incluindo as paradas.'],
      };
    case 'velocidade':
      return a.esporte === 'corrida'
        ? { titulo: 'Ritmo', paragrafos: ['O tempo médio para cada quilômetro (min/km). Quanto menor o número, mais rápido foi o treino.'] }
        : { titulo: 'Velocidade média', paragrafos: ['A distância dividida pelo tempo em movimento, em km/h.'] };
    case 'elevacao':
      return { titulo: 'Elevação', paragrafos: ['O quanto você subiu no total ao longo do percurso, em metros (a soma das subidas).'] };
    case 'fc':
      return {
        titulo: 'FC média',
        paragrafos: ['A frequência cardíaca média durante a atividade, em batimentos por minuto (bpm).', 'Comparada ao seu LTHR vigente na data, define o esforço e o HRSS. "—" quando a atividade não tem sensor de FC.'],
      };
    case 'potencia':
      return {
        titulo: 'Potência',
        paragrafos:
          a.potenciaOrigem === 'medida'
            ? ['A potência média em watts, medida pelo seu medidor de potência.']
            : a.potenciaOrigem === 'estimada'
              ? ['A potência média em watts, estimada pelo app a partir da velocidade, da subida e do seu peso (por isso o "est.").']
              : ['"—": a atividade não tem medidor de potência e não deu para estimar. A estimativa usa a velocidade, a subida e o seu peso, da Configuração.'],
      };
    case 'clima':
      return {
        titulo: 'Clima',
        paragrafos: [
          'A temperatura média durante a atividade e a condição do tempo (o ícone), do Open-Meteo, pelo ponto de partida e pelo horário.',
          extras.condicao ? `Condição desta atividade: ${extras.condicao}.` : '"—": o clima não pôde ser obtido (por exemplo, atividade sem localização).',
        ],
      };
    case 'hrss': {
      const origem = ROTULO_ORIGEM_HRSS[a.hrssOrigem];
      return {
        titulo: 'HRSS',
        paragrafos: [
          'O HRSS (Heart Rate Stress Score) mede a carga do treino pela frequência cardíaca: uma hora no seu LTHR vale cerca de 100. Quanto maior, mais pesado foi o treino.',
          'É a base da curva de Forma e do Condicionamento.',
          a.hrss === null || a.hrss === undefined
            ? 'Sem HRSS: não há configuração de FC vigente na data da atividade (veja Configuração) ou a atividade não tem FC.'
            : origem
              ? `Este valor foi ${origem}.`
              : null,
          a.alertas?.length ? 'Há avisos nesta atividade: abra-a para ver os detalhes.' : null,
        ].filter(Boolean),
      };
    }
    case 'miniatura':
      return {
        titulo: 'Traçado do percurso',
        paragrafos: [
          'O desenho do percurso, com o início marcado em verde. Sem GPS, mostra o perfil de elevação (ou da FC).',
          'O desenho cinza ao fundo do bloco do título é o perfil de elevação da atividade.',
        ],
      };
    case 'origem':
      return {
        titulo: `Origem: ${extras.fonte?.rotulo ?? ''}`.trim(),
        paragrafos: [
          extras.fonte?.id === 'garmin'
            ? 'A atividade veio da sincronização com o Garmin Connect.'
            : extras.fonte?.id === 'intervals'
              ? 'A atividade veio da sincronização com o intervals.icu (por exemplo, pedais gravados no aparelho IGPSPORT).'
              : 'A atividade veio de um arquivo que você importou (.fit, .gpx ou .tcx).',
        ],
      };
    default:
      return { titulo: '', paragrafos: [] };
  }
}

/**
 * Popovers explicativos dos dados do card. Abrem ao passar o mouse, focar pelo teclado ou tocar; clicar fixa, e Esc ou um clique fora fecham.
 * @returns {{ ligar: (el: HTMLElement, guia: { titulo: string, paragrafos: string[] }) => void, fechar: () => void }}
 */
export function criarPopoversDosDados() {
  const controle = criarControlePopover();
  return {
    ligar(el, { titulo, paragrafos }) {
      el.dataset.guia = '';
      el.tabIndex = 0;
      const conteudo = () => [h('p', { class: 'dia-pop-titulo' }, titulo), ...paragrafos.map((p) => h('p', { class: 'cal-pop-texto' }, p))];
      const abrir = (opcoes) => controle.abrir(el, conteudo, { rotulo: titulo, ...opcoes });
      el.addEventListener('mouseenter', () => abrir());
      el.addEventListener('mouseleave', controle.agendarFechar);
      el.addEventListener('focus', () => abrir());
      el.addEventListener('click', () => {
        if (controle.coluna() === el && controle.fixado()) controle.fechar();
        else abrir({ fixar: true });
      });
    },
    fechar: controle.fechar,
  };
}
