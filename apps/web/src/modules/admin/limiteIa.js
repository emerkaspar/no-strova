import { carimboDeServidor, mesclarDocumento, observarDocumento } from '../../core/db.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';

const PADRAO = 5;

/**
 * Cartão do administrador (dono do sistema): limite diário de sugestões de IA por usuário. Fica em
 * `configuracoes/ia`; as Functions leem na hora de cada pedido. Com "sem limite", nenhum usuário é barrado pela cota.
 */
export function criarCartaoLimiteIa() {
  const limite = campo({ id: 'ia-limite', rotulo: 'Sugestões por usuário por dia', tipo: 'number', min: '1', max: '500', step: '1', value: String(PADRAO), dica: 'De 1 a 500. Treinos e peso contam juntos.' });
  const semLimite = h('input', { type: 'checkbox', id: 'ia-sem-limite' });
  const mensagem = areaMensagem();
  const botao = h('button', { class: 'btn', type: 'submit' }, 'Salvar limite');
  const estado = h('p', { class: 'texto-secundario' }, 'Carregando…');

  function sincronizar() {
    limite.input.disabled = semLimite.checked;
  }
  semLimite.addEventListener('change', sincronizar);

  const cancelar = observarDocumento(
    'configuracoes/ia',
    (dados) => {
      const sem = dados?.semLimite === true;
      limite.input.value = String(Number.isInteger(dados?.chamadasPorDia) ? dados.chamadasPorDia : PADRAO);
      semLimite.checked = sem;
      sincronizar();
      estado.textContent = !dados ? `Valor padrão em uso: ${PADRAO} por usuário por dia.` : sem ? 'Hoje: sem limite.' : `Hoje: ${dados.chamadasPorDia} por usuário por dia.`;
    },
    () => {
      estado.textContent = 'Não foi possível ler o limite atual.';
    },
  );

  const form = h(
    'form',
    {
      novalidate: true,
      class: 'peso-form',
      onSubmit: (e) => {
        e.preventDefault();
        executarComBotao(botao, mensagem, async () => {
          const n = Number(limite.input.value);
          if (!semLimite.checked && (!Number.isInteger(n) || n < 1 || n > 500)) throw new Error('Informe um limite inteiro de 1 a 500.');
          await mesclarDocumento('configuracoes/ia', { chamadasPorDia: Number.isInteger(n) && n >= 1 && n <= 500 ? n : PADRAO, semLimite: semLimite.checked, atualizadoEm: carimboDeServidor() });
        });
      },
    },
    limite.raiz,
    h('div', { class: 'campo' }, h('label', { class: 'ia-sem-limite', for: 'ia-sem-limite' }, semLimite, ' Sem limite')),
    h('div', { class: 'campo campo-botao' }, botao),
  );

  const cartao = h(
    'section',
    { class: 'card' },
    h('h2', null, 'Limite das sugestões de IA'),
    h('p', { class: 'texto-secundario' }, 'Só você, como administrador, vê esta opção. Cada sugestão de treino ou de peso consome uma chamada do Gemini. Use o limite para controlar o gasto ou marque "Sem limite" para testar.'),
    estado,
    form,
    mensagem.el,
  );
  cartao.cancelar = cancelar;
  return cartao;
}
