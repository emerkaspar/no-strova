import { registrarAtividadeManual } from '../../application/atividades.js';
import { areaMensagem, campo, executarComBotao, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarNumero, hojeIso } from '../../utils/formatters.js';
import { abrirFeedbackPorId } from './feedbackModal.js';
import { OPCOES_ESPORTE, OPCOES_ZONA, TEXTO_ALERTA } from './textos.js';

/** Painel de cadastro manual (sem arquivo). */
export function painelManual() {
  const esporte = selecao({ id: 'man-esporte', rotulo: 'Esporte', opcoes: OPCOES_ESPORTE });
  const data = campo({ id: 'man-data', rotulo: 'Data', tipo: 'date', value: hojeIso(), max: hojeIso() });
  const hora = campo({ id: 'man-hora', rotulo: 'Hora de início (opcional)', tipo: 'time' });
  const duracao = campo({ id: 'man-duracao', rotulo: 'Duração (minutos)', inputmode: 'decimal', autocomplete: 'off' });
  const distancia = campo({ id: 'man-distancia', rotulo: 'Distância (km, opcional)', inputmode: 'decimal' });
  const altimetria = campo({ id: 'man-altimetria', rotulo: 'Subida (m, opcional)', inputmode: 'decimal' });
  const fcMedia = campo({ id: 'man-fc', rotulo: 'FC média (bpm)', inputmode: 'numeric', dica: 'Informe a FC média, a zona ou o HRSS.' });
  const zona = selecao({
    id: 'man-zona',
    rotulo: 'Zona predominante',
    opcoes: [{ valor: '', rotulo: '—' }, ...OPCOES_ZONA],
    dica: 'Usada quando não há FC.',
  });
  const hrss = campo({ id: 'man-hrss', rotulo: 'HRSS (opcional)', inputmode: 'decimal', dica: 'Se informado, vale no lugar do cálculo.' });
  const calorias = campo({ id: 'man-calorias', rotulo: 'Calorias (kcal, opcional)', inputmode: 'numeric', dica: 'Sem valor, o app estima.' });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Registrar atividade');

  const form = h(
    'form',
    {
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          const r = await registrarAtividadeManual({
            esporte: esporte.select.value,
            data: data.input.value,
            horaInicio: hora.input.value,
            duracaoMin: duracao.input.value,
            distanciaKm: distancia.input.value,
            altimetriaM: altimetria.input.value,
            fcMedia: fcMedia.input.value,
            zona: zona.select.value,
            hrssManual: hrss.input.value,
            calorias: calorias.input.value,
          });
          const texto = r.hrss === null ? 'HRSS não calculado' : `HRSS ${formatarNumero(r.hrss, 1)}`;
          const avisos = (r.alertas ?? []).map((a) => TEXTO_ALERTA[a] ?? a).join(' ');
          mensagem.mostrar(`Atividade registrada · ${texto}. ${avisos}`.trim(), 'ok');
          if (r.atividadeId) abrirFeedbackPorId(r.atividadeId, { primeiraVez: true }).catch(() => {});
        });
      },
    },
    h(
      'div',
      { class: 'grid' },
      esporte.raiz,
      data.raiz,
      hora.raiz,
      duracao.raiz,
      distancia.raiz,
      altimetria.raiz,
      fcMedia.raiz,
      zona.raiz,
      hrss.raiz,
      calorias.raiz,
    ),
    mensagem.el,
    botao,
  );

  return h('div', { class: 'painel' }, h('h2', null, 'Registrar manualmente'), form);
}
