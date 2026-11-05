import { inicioDaSemana, primeiroDoMes, somarDias, somarMeses } from '@no-strova/domain';
import { garminEnviarTreinos, garminInformarCodigo } from '../../core/functions.js';
import { observarEnvioGarmin } from '../../infrastructure/garminEnvioRepo.js';
import { areaMensagem, campo, selecao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData } from '../../utils/formatters.js';

const PERIODOS = [
  { valor: 'proximos7', rotulo: 'Próximos 7 dias' },
  { valor: 'proximos14', rotulo: 'Próximos 14 dias' },
  { valor: 'semana', rotulo: 'Semana mostrada no calendário' },
  { valor: 'mes', rotulo: 'Mês mostrado no calendário' },
];

/** Intervalo yyyy-mm-dd (inclusive) de cada opção do seletor. */
function intervaloDe(periodo, { hoje, ancora }) {
  if (periodo === 'proximos14') return { de: hoje, ate: somarDias(hoje, 13) };
  if (periodo === 'semana') {
    const inicio = inicioDaSemana(ancora);
    return { de: inicio, ate: somarDias(inicio, 6) };
  }
  if (periodo === 'mes') {
    const inicio = primeiroDoMes(ancora);
    return { de: inicio, ate: somarDias(somarMeses(inicio, 1), -1) };
  }
  return { de: hoje, ate: somarDias(hoje, 6) };
}

const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

/** Resumo do envio, em frases curtas. */
export function resumirEnvio(r) {
  const partes = [];
  if (r.enviados > 0) partes.push(`${plural(r.enviados, 'treino enviado e agendado', 'treinos enviados e agendados')} no Garmin Connect`);
  if (r.substituidos > 0) partes.push(plural(r.substituidos, 'treino alterado foi atualizado', 'treinos alterados foram atualizados'));
  if (r.jaEnviados > 0) partes.push(`${plural(r.jaEnviados, 'já estava', 'já estavam')} no Garmin, sem mudanças`);
  if (r.falhas > 0) partes.push(plural(r.falhas, 'treino não pôde ser enviado', 'treinos não puderam ser enviados'));
  if (r.semPassos > 0) partes.push(`${plural(r.semPassos, 'treino ficou de fora', 'treinos ficaram de fora')} por não ter passos nem duração`);
  return `${partes.join(' · ')}.`;
}

/**
 * Painel "Enviar para o Garmin": o usuário informa o e-mail e a senha do Garmin Connect a cada envio e o servidor cria os
 * treinos planejados do período na conta dele, agendados nos dias certos. A senha segue direto para a Function e nunca é
 * guardada. Com a verificação em duas etapas, o painel pede o código enquanto o envio espera.
 * @param {{ uid: string, emailInicial?: string, hoje: string, obterAncora: () => string, aoFechar: () => void }} p
 */
export function criarPainelEnviarGarmin({ uid, emailInicial = '', hoje, obterAncora, aoFechar }) {
  const periodo = selecao({ id: 'gar-periodo', rotulo: 'Período', opcoes: PERIODOS, valor: 'proximos7' });
  const email = campo({ id: 'gar-email', rotulo: 'E-mail do Garmin Connect', tipo: 'email', value: emailInicial, autocomplete: 'off' });
  const senha = campo({ id: 'gar-senha', rotulo: 'Senha do Garmin Connect', tipo: 'password', autocomplete: 'off', dica: 'A mesma que você usa em connect.garmin.com.' });
  const mensagem = areaMensagem();
  const andamento = h('p', { class: 'estimativa', 'aria-live': 'polite', hidden: true });
  const resultado = h('div', { 'aria-live': 'polite' });
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Enviar para o Garmin');

  // código de duas etapas: só aparece quando o Garmin pede
  const codigo = campo({ id: 'gar-codigo', rotulo: 'Código de verificação do Garmin', inputmode: 'numeric', autocomplete: 'one-time-code', dica: 'O Garmin enviou o código por e-mail, SMS ou aplicativo autenticador.' });
  const botaoCodigo = h('button', { class: 'btn', type: 'button' }, 'Confirmar código');
  const blocoCodigo = h('div', { class: 'pilha', hidden: true }, codigo.raiz, h('div', { class: 'linha-botoes' }, botaoCodigo));

  let cancelarObservacao = null;
  const pararObservacao = () => {
    cancelarObservacao?.();
    cancelarObservacao = null;
  };

  function mostrarEstado(dados) {
    blocoCodigo.hidden = dados.estado !== 'aguardando-codigo';
    andamento.hidden = !['conectando', 'aguardando-codigo', 'enviando'].includes(dados.estado);
    if (dados.estado === 'conectando') andamento.textContent = 'Entrando no Garmin Connect…';
    else if (dados.estado === 'aguardando-codigo') andamento.textContent = 'O Garmin pediu o código de verificação. Digite-o abaixo.';
    else if (dados.estado === 'enviando') andamento.textContent = `Enviando treinos… ${dados.feitos ?? 0} de ${dados.total ?? '?'}`;
  }

  function observarAndamento() {
    pararObservacao();
    let inicial = null;
    let primeiro = true;
    cancelarObservacao = observarEnvioGarmin(
      uid,
      (dados) => {
        // a primeira leitura pode ser de um envio antigo: só vale o que mudou depois do clique
        const marca = dados?.atualizadoEm?.toMillis?.() ?? null;
        if (primeiro) {
          primeiro = false;
          inicial = marca;
          return;
        }
        if (dados && marca !== inicial) mostrarEstado(dados);
      },
      () => {},
    );
  }

  botaoCodigo.addEventListener('click', async () => {
    mensagem.limpar();
    botaoCodigo.disabled = true;
    try {
      await garminInformarCodigo({ codigo: codigo.input.value });
      codigo.input.value = '';
      blocoCodigo.hidden = true;
      andamento.hidden = false;
      andamento.textContent = 'Código enviado. Continuando…';
    } catch (err) {
      mensagem.mostrar(err.message || 'Não foi possível enviar o código.');
    } finally {
      botaoCodigo.disabled = false;
    }
  });

  async function enviar(e) {
    e.preventDefault();
    mensagem.limpar();
    resultado.replaceChildren();
    if (!email.input.value.trim() || !senha.input.value) {
      mensagem.mostrar('Informe o e-mail e a senha do Garmin Connect.');
      return;
    }
    const { de, ate } = intervaloDe(periodo.select.value, { hoje, ancora: obterAncora() });
    botao.disabled = true;
    andamento.hidden = false;
    andamento.textContent = 'Entrando no Garmin Connect…';
    observarAndamento();
    try {
      const r = await garminEnviarTreinos({ email: email.input.value.trim(), senha: senha.input.value, de, ate });
      resultado.replaceChildren(
        h('p', { class: `mensagem ${r.falhas > 0 ? 'mensagem-aviso' : 'mensagem-ok'}` }, resumirEnvio(r)),
        r.problemas.length > 0 ? h('ul', null, ...r.problemas.map((p) => h('li', null, `${formatarData(p.data)} · ${p.nome}: ${p.motivo}`))) : null,
        r.semConfigFc ? h('p', { class: 'texto-secundario' }, 'Sem a configuração de FC (em Configuração), os passos foram sem faixa de FC.') : null,
        r.enviados + r.substituidos > 0
          ? h('p', null, h('strong', null, 'Agora abra o app Garmin Connect no celular e sincronize o relógio'), ' (com o aparelho ligado e perto). Os treinos aparecem no calendário e em Treinos.')
          : null,
      );
    } catch (err) {
      mensagem.mostrar(err.message || 'Não foi possível enviar os treinos.');
    } finally {
      senha.input.value = ''; // nunca fica na tela depois do envio
      pararObservacao();
      andamento.hidden = true;
      blocoCodigo.hidden = true;
      botao.disabled = false;
    }
  }

  const form = h(
    'form',
    { novalidate: true, autocomplete: 'off', onSubmit: enviar },
    h('div', { class: 'grid' }, periodo.raiz, email.raiz, senha.raiz),
    h('div', { class: 'linha-botoes' }, botao, h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoFechar }, 'Fechar')),
  );

  return h(
    'div',
    { class: 'exportar-garmin' },
    h('p', { class: 'cg-mini-rotulo' }, 'Enviar para o Garmin'),
    h('p', null, 'Cria os treinos planejados do período na sua conta do Garmin Connect, já agendados nos dias certos e com a faixa de FC de cada passo. Depois é só sincronizar o relógio ou o Edge pelo app do Garmin Connect.'),
    h('p', { class: 'texto-secundario' }, 'A senha é usada só neste envio e não fica guardada: digite-a de novo a cada vez. Funciona por um acesso não oficial ao Garmin Connect, que a Garmin pode bloquear ou mudar. Se a sua conta usa verificação em duas etapas, o sistema pede o código aqui mesmo.'),
    form,
    andamento,
    blocoCodigo,
    mensagem.el,
    resultado,
  );
}
