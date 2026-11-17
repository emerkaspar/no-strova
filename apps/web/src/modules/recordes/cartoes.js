import { esforcosDoEsporte, maiorCondicionamento, maiorSequenciaDeSemanas, melhoresEsforcosDasAtividades, recordesDasAtividades, recordesDeClima, semanaMaisPesada } from '@no-strova/domain';
import { formatarData, formatarDistancia, formatarDuracao, formatarNumero } from '../../utils/formatters.js';
import { tempoDeEsforco } from '../atividades/esforcos.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';

const metros = (m) => (Number.isFinite(m) && m > 0 ? `${formatarNumero(m, 0)} m` : '—');

/** Abas da página, na ordem em que aparecem. Os melhores esforços (um por distância e esporte) entram na aba `esforcos`. */
export const GRUPOS_DE_RECORDE = [
  { id: 'marcas', nome: 'Maiores marcas', titulo: 'Maiores marcas', icone: 'esporte' },
  { id: 'esforcos', nome: 'Esforços', titulo: 'Melhores esforços', icone: 'cronometro' },
  { id: 'potencia', nome: 'Potência', titulo: 'Potência (ciclismo)', icone: 'hrss' },
  { id: 'clima', nome: 'Clima', titulo: 'Clima', icone: 'nuvem' },
  { id: 'carga', nome: 'Carga', titulo: 'Carga e consistência', icone: 'atividades' },
];

/** Cartões de recorde: rótulo, campo, ícone e como formatar o valor. */
export const CARDS_DE_RECORDE = [
  { id: 'distancia', grupo: 'marcas', rotulo: 'Distância', rotuloCompleto: 'Maior distância', icone: 'distancia', formatar: (v) => formatarDistancia(v) },
  { id: 'duracao', grupo: 'marcas', rotulo: 'Tempo', rotuloCompleto: 'Maior tempo', icone: 'duracao', formatar: (v) => formatarDuracao(v) },
  { id: 'elevacao', grupo: 'marcas', rotulo: 'Elevação', rotuloCompleto: 'Maior elevação', icone: 'elevacao', formatar: metros },
  { id: 'hrss', grupo: 'marcas', rotulo: 'HRSS', rotuloCompleto: 'Maior HRSS', icone: 'hrss', formatar: (v) => formatarNumero(v, 1) },
  { id: 'fcMax', grupo: 'marcas', rotulo: 'FC máxima', rotuloCompleto: 'Maior FC máxima', icone: 'fc', formatar: (v) => `${formatarNumero(v, 0)} bpm` },
  { id: 'potencia', grupo: 'potencia', rotulo: 'Potência média', rotuloCompleto: 'Maior potência média · Ciclismo', icone: 'hrss', formatar: (v) => `${formatarNumero(v, 0)} W`, campo: 'potenciaMediaW' },
  { id: 'potencia20min', grupo: 'potencia', rotulo: 'Melhor 20 min', rotuloCompleto: 'Melhor 20 min de potência · Ciclismo', icone: 'hrss', formatar: (v) => `${formatarNumero(v, 0)} W`, campo: 'potenciaMax20minW' },
  { id: 'quente', grupo: 'clima', rotulo: 'Mais quente', rotuloCompleto: 'Atividade mais quente', icone: 'sol', formatar: (v) => `${formatarNumero(v, 1)} °C`, campo: 'temperaturaMediaC', aceitaZero: true },
  { id: 'fria', grupo: 'clima', rotulo: 'Mais fria', rotuloCompleto: 'Atividade mais fria', icone: 'floco', formatar: (v) => `${formatarNumero(v, 1)} °C`, campo: 'temperaturaMediaC', aceitaZero: true },
  { id: 'vento', grupo: 'clima', rotulo: 'Vento médio', rotuloCompleto: 'Maior vento médio', icone: 'vento', formatar: (v) => `${formatarNumero(v, 1)} km/h`, campo: 'ventoKmh' },
  { id: 'semanaPesada', grupo: 'carga', rotulo: 'Semana pesada', rotuloCompleto: 'Semana mais pesada', icone: 'hrss', formatar: (v) => `${formatarNumero(v, 0)} HRSS` },
  { id: 'sequencia', grupo: 'carga', rotulo: 'Sequência', rotuloCompleto: 'Maior sequência', icone: 'plano', formatar: (v) => `${v} semana${v === 1 ? '' : 's'}` },
  { id: 'condicionamento', grupo: 'carga', rotulo: 'Condicionamento', rotuloCompleto: 'Maior Condicionamento', icone: 'atividades', formatar: (v) => formatarNumero(v, 1), geral: true },
];

/** Cartões de melhor 5 km e 10 km de um esporte (um par por esporte mostrado). */
export const cartoesDeEsforco = (esporte) =>
  esforcosDoEsporte(esporte).map((e) => ({ id: `${e.id}-${esporte}`, grupo: 'esforcos', rotulo: e.rotulo, rotuloCompleto: `Melhor ${e.rotulo} · ${ROTULO_ESPORTE[esporte] ?? esporte}`, rotuloIcone: esporte, icone: 'duracao', formatar: tempoDeEsforco, esforcoM: e.metros, esporte }));

/**
 * Calcula os recordes de uma lista de atividades. O Condicionamento não vem de uma atividade: é o pico da curva diária (vale para
 * todos os esportes). Semana pesada, sequência e Condicionamento entram sem link, com um texto de "quando".
 * @returns {Record<string, { valor: number, atividade: any } | null>}
 */
export function calcularRecordes(lista, { esportesEsforco, serieForma, intervalo, hoje }) {
  const pico = maiorCondicionamento(serieForma, intervalo);
  const semana = semanaMaisPesada(lista);
  const sequencia = maiorSequenciaDeSemanas(lista, hoje);
  const sem = (id, valor, quando) => ({ valor, atividade: { id, semLink: true, quando } });
  return {
    ...recordesDasAtividades(lista),
    ...recordesDeClima(lista),
    ...Object.fromEntries(
      esportesEsforco.flatMap((e) => {
        const m = melhoresEsforcosDasAtividades(lista.filter((a) => a.esporte === e));
        return esforcosDoEsporte(e).map((x) => [`${x.id}-${e}`, m[x.id]]);
      }),
    ),
    semanaPesada: semana ? sem(`sem:${semana.inicio}`, semana.valor, `Semana de ${formatarData(semana.inicio).slice(0, 5)}`) : null,
    sequencia: sequencia ? sem(`seq:${sequencia.valor}`, sequencia.valor, 'Semanas seguidas') : null,
    condicionamento: pico ? sem(`cond:${pico.data}`, pico.valor, formatarData(pico.data)) : null,
  };
}
