import { h } from '../../utils/dom.js';
import { criarControlePopover } from '../inicio/semanaPopover.js';

/** Texto explicativo de cada indicador de medidas: o que é, como ler e o limite do número. */
export function guiaDoIndicador(id, rotuloDaMedida = '') {
  switch (id) {
    case 'gordura':
      return {
        titulo: '% de gordura',
        paragrafos: [
          'Estimativa pelo método da Marinha dos EUA, que usa a altura e as medidas do pescoço e do abdômen (homens) ou do pescoço, da cintura e do quadril (mulheres).',
          'Serve para acompanhar a tendência entre medições, feitas sempre do mesmo jeito. O erro típico é de alguns pontos percentuais, então não substitui bioimpedância ou DEXA.',
        ],
      };
    case 'massaGorda':
      return { titulo: 'Massa gorda', paragrafos: ['É o peso do dia multiplicado pelo % de gordura estimado. Se ela cai e a massa magra se mantém, você está perdendo gordura de fato.'] };
    case 'massaMagra':
      return {
        titulo: 'Massa magra',
        paragrafos: ['É o peso do dia menos a massa gorda: músculos, ossos, órgãos e água. É uma estimativa.', 'Na perda de peso, o ideal é que ela se mantenha ou suba. Se cair junto com a gordura, reforce o treino de força, a proteína e o descanso.'],
      };
    case 'cinturaQuadril':
      return {
        titulo: 'Relação cintura/quadril',
        paragrafos: ['Cintura dividida pelo quadril. Mostra onde a gordura se concentra: mais na barriga, maior o risco cardiovascular.', 'A OMS considera risco aumentado acima de 0,90 nos homens e de 0,85 nas mulheres.'],
      };
    case 'cinturaAltura':
      return {
        titulo: 'Relação cintura/altura',
        paragrafos: ['Cintura dividida pela altura. A regra prática é manter a cintura abaixo da metade da altura (índice abaixo de 0,5).', 'De 0,5 a 0,59 pede atenção; 0,6 ou mais indica risco alto. Vale para adultos de qualquer altura.'],
      };
    default:
      return { titulo: rotuloDaMedida, paragrafos: ['Compare sempre com a medição anterior e com a primeira. Variações menores que 1 cm podem ser só erro de medição.'] };
  }
}

/**
 * Popover dos indicadores (mesmo comportamento dos detalhes da semana): abre ao passar o mouse, focar ou clicar (o
 * clique fixa). Chame `fechar` ao sair da tela.
 */
export function criarPopoversDeMedidas() {
  const controle = criarControlePopover();
  const conteudo = (guia) => () => [h('div', { class: 'dia-pop-titulo' }, guia.titulo), ...guia.paragrafos.map((p) => h('p', { class: 'cal-pop-texto' }, p))];
  return {
    ligar(el, guia) {
      const abrir = () => controle.abrir(el, conteudo(guia), { rotulo: guia.titulo });
      el.tabIndex = 0;
      el.classList.add('medidas-com-guia');
      el.addEventListener('mouseenter', abrir);
      el.addEventListener('mouseleave', controle.agendarFechar);
      el.addEventListener('focus', abrir);
      el.addEventListener('blur', controle.agendarFechar);
      el.addEventListener('click', () => {
        if (controle.coluna() === el && controle.fixado()) controle.fechar();
        else controle.abrir(el, conteudo(guia), { fixar: true, rotulo: guia.titulo });
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
      return el;
    },
    fechar: controle.fechar,
  };
}
