import { salvarMetaDeForma } from '../../application/plano.js';
import { excluirMeta } from '../../infrastructure/planoRepo.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarForma, formatarNumero } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { confirmar } from '../../utils/modal.js';
import { ligarFormRecolhivel } from './formRecolhivel.js';
import { comSinal, montarCartaoDeMeta } from './metaCartao.js';

// fora do cartão: ele é refeito a cada atualização de dados
const estadoDoFormulario = { aberto: false };

const ROTULO_ESTADO = Object.freeze({ atinge: 'Chega lá', abaixo: 'Fica abaixo', acima: 'Fica acima' });

// orientação curta de cada situação (a conta e o estado vêm do domínio)
const ORIENTACAO = Object.freeze({
  atinge: 'O plano atual chega dentro da meta.',
  abaixo: 'Falta descanso: reduza a carga nos dias antes da data.',
  acima: 'Dá para treinar um pouco mais antes da data.',
});

/** Frase que explica o resultado da meta e o que fazer. */
export function textoDaAvaliacao(a) {
  const data = formatarData(a.dataAlvo);
  if (a.estado === 'sem-dados') return `Ainda não dá para projetar a Forma em ${data}: registre atividades e planeje treinos até lá.`;
  const projetada = formatarForma(a.formaProjetada, 1);
  const alvo = formatarForma(a.formaAlvo, 1);
  const pontos = formatarNumero(Math.abs(a.diferenca), 1);
  if (a.estado === 'atinge') return `Com o plano atual você chega em ${data} com Forma ${projetada}, dentro da meta (${alvo}).`;
  if (a.estado === 'abaixo') return `Com o plano atual você chega em ${data} com Forma ${projetada}, ${pontos} pontos abaixo da meta (${alvo}). Falta descanso: reduza a carga nos dias antes dessa data.`;
  return `Com o plano atual você chega em ${data} com Forma ${projetada}, ${pontos} pontos acima da meta (${alvo}). Dá para treinar um pouco mais antes dessa data.`;
}

/**
 * Cartão da meta de forma: formulário, resultado da avaliação e metas anteriores.
 * @param {{ uid: string, hoje: string, metaAtiva: any|null, metasAnteriores: any[], avaliacao: any|null }} p
 */
export function criarCartaoMeta({ uid, hoje, metaAtiva, metasAnteriores, avaliacao }) {
  const forma = campo({ id: 'meta-forma', rotulo: 'Forma desejada', inputmode: 'decimal', value: metaAtiva?.formaAlvo ?? '', dica: 'Ex.: +10 para chegar descansado; −15 para chegar treinando forte.' });
  const dataAlvo = campo({ id: 'meta-data', rotulo: 'Na data', tipo: 'date', value: metaAtiva?.dataAlvo ?? '', min: hoje });
  const mensagem = areaMensagem();
  const aviso = areaMensagem(); // visível com o formulário fechado (ex.: erro ao remover)
  const botao = h('button', { class: 'btn', type: 'submit' }, metaAtiva ? 'Trocar a meta' : 'Definir meta');

  const form = h(
    'form',
    {
      class: 'prog-form',
      hidden: true,
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          await salvarMetaDeForma({
            uid,
            hoje,
            entrada: { formaAlvo: forma.input.value, dataAlvo: dataAlvo.input.value },
            metasAtivas: metaAtiva ? [metaAtiva] : [],
          });
          definirAberto(false);
        });
      },
    },
    h('div', { class: 'grid' }, forma.raiz, dataAlvo.raiz),
    mensagem.el,
    h('div', { class: 'linha-botoes' }, botao, h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => definirAberto(false) }, 'Cancelar')),
  );

  const botaoAbrir = h('button', { type: 'button' });
  const definirAberto = ligarFormRecolhivel({ estado: estadoDoFormulario, botao: botaoAbrir, form, rotulo: metaAtiva ? 'Trocar meta' : '+ Definir meta', classeFechado: 'btn', icones: metaAtiva ? { fechado: 'lapis', aberto: 'fechar' } : null });
  const botaoRemover = metaAtiva
    ? h(
        'button',
        {
          class: 'btn-icone btn-icone-mini btn-icone-perigo',
          type: 'button',
          title: 'Remover meta',
          'aria-label': 'Remover meta',
          onClick: async () => {
            if (!(await confirmar({ titulo: 'Remover a meta de Forma?', mensagem: 'A meta deixa de aparecer no plano.', confirmarTexto: 'Remover', tipo: 'perigo', icone: 'lixeira' }))) return;
            try {
              await excluirMeta(metaAtiva.id);
            } catch {
              aviso.mostrar('Não foi possível remover a meta.');
            }
          },
        },
        icone('lixeira', 16),
      )
    : null;

  const comDados = Boolean(metaAtiva && avaliacao && avaliacao.estado !== 'sem-dados');
  const um = (v) => formatarNumero(v, 1);
  const metricas = comDados
    ? [
        { rotulo: `Previsto em ${formatarData(avaliacao.dataAlvo).slice(0, 5)}`, valor: formatarForma(avaliacao.formaProjetada, 1) },
        { rotulo: 'Meta', valor: formatarForma(avaliacao.formaAlvo, 1) },
        { rotulo: 'Diferença', valor: comSinal(avaliacao.diferenca, um), sufixo: 'pts', destaque: true },
      ]
    : [];

  return montarCartaoDeMeta({
    id: 'plano-meta-forma', // 'meta-forma' já é o id do campo do formulário
    titulo: 'Meta de forma',
    estado: metaAtiva ? (avaliacao?.estado ?? 'sem-dados') : 'sem-dados',
    rotuloEstado: comDados ? ROTULO_ESTADO[avaliacao.estado] : null,
    acoes: [botaoAbrir, botaoRemover],
    introducao: metaAtiva ? null : 'Opcional, complementa a meta de Condicionamento. Defina “chegar com Forma X na data Y” (por exemplo, descansado no dia de um evento) e o app mostra se o plano atual chega lá.',
    metricas,
    orientacao: !metaAtiva ? null : comDados ? ORIENTACAO[avaliacao.estado] : avaliacao ? textoDaAvaliacao(avaliacao) : null,
    dias: metaAtiva && avaliacao && avaliacao.dias >= 0 ? { dias: avaliacao.dias, dataAlvo: formatarData(avaliacao.dataAlvo) } : null,
    extras: [aviso.el, form],
    anteriores: metasAnteriores.map((m) => ({ valor: `Forma ${formatarForma(m.formaAlvo, 1)}`, data: formatarData(m.dataAlvo) })),
  });
}
