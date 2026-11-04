import { estimarEstresseEstruturado, faixaDeFcDaZona, FOCOS, formatarSegundos, gerarFitDoTreino, NIVEIS, resumirTreino } from '@no-strova/domain';
import { adicionarModeloAoPlano } from '../../application/treinos.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero } from '../../utils/formatters.js';
import { baixarArquivo, perfilDoTreino } from '../../utils/perfilTreino.js';
import { ROTULO_ESPORTE } from '../atividades/textos.js';
import { confirmar } from '../../utils/modal.js';

/** Descrições padrão dos passos: não repetem na lista (o rótulo do passo já diz). */
const DESCRICOES_PADRAO = ['Aquecimento progressivo', 'Volta à calma', 'Recuperação', 'Começando bem leve', 'Subindo para a zona 2', 'Solta e respira'];

/**
 * Detalhe de um treino: perfil, passos (com a faixa de FC de cada zona), resumo, "Adicionar ao plano" numa data e
 * "Exportar para o relógio". Os treinos próprios ganham editar e excluir; os do catálogo, "Duplicar e editar".
 * @param {{
 *   uid: string, modelo: any, configs: any[], hoje: string,
 *   aoFechar: () => void, aoEditar: (modelo: any) => void, aoExcluir?: (modelo: any) => Promise<void>
 * }} p
 */
export function criarDetalheTreino({ uid, modelo, configs, hoje, aoFechar, aoEditar, aoExcluir }) {
  const config = configs[0] ?? null; // a mais recente
  const resumo = resumirTreino(modelo.passos);
  const hrss = estimarEstresseEstruturado({ passos: modelo.passos, config });
  const proprio = modelo.origem === 'proprio';
  const mensagem = areaMensagem();

  // ---- passos ----
  const linhas = [];
  for (const p of modelo.passos) {
    if (p.tipo === 'serie') {
      const fcE = faixaDeFcDaZona(p.esforco.zona, config);
      const fcR = faixaDeFcDaZona(p.recuperacao.zona, config);
      linhas.push({
        rotulo: `${p.repeticoes} ×`,
        texto: `${formatarSegundos(p.esforco.duracaoS)} em ${p.esforco.zona}${p.esforco.descricao ? ` (${p.esforco.descricao})` : ''}, recuperação de ${formatarSegundos(p.recuperacao.duracaoS)} em ${p.recuperacao.zona}`,
        fc: [fcE, fcR],
        zonas: [p.esforco.zona, p.recuperacao.zona],
      });
    } else {
      const rotulo = p.papel === 'aquecimento' ? 'Aquecimento' : p.papel === 'desaquecimento' ? 'Volta à calma' : p.papel === 'recuperacao' ? 'Recuperação' : 'Principal';
      linhas.push({
        rotulo,
        // mostra a descrição dos passos que têm uma instrução (esforço principal, aberturas do aquecimento), sem repetir os rótulos padrão
        texto: `${formatarSegundos(p.duracaoS)} em ${p.zona}${p.descricao && !DESCRICOES_PADRAO.includes(p.descricao) ? ` (${p.descricao})` : ''}${p.alvoAberto ? ' · sem alvo de FC' : ''}`,
        fc: [p.alvoAberto ? null : faixaDeFcDaZona(p.zona, config)],
        zonas: [p.zona],
      });
    }
  }
  const faixa = (f) => (f ? `${f[0]}–${f[1]} bpm` : null);
  const lista = h(
    'ol',
    { class: 'treino-passos' },
    ...linhas.map((l) =>
      h(
        'li',
        null,
        h('strong', null, l.rotulo),
        ' ',
        l.texto,
        l.fc.some(Boolean) ? h('span', { class: 'texto-secundario' }, ` · FC ${l.fc.map(faixa).filter(Boolean).join(' / ')}`) : null,
      ),
    ),
  );

  // ---- adicionar ao plano ----
  const data = campo({ id: 'treino-data', rotulo: 'Adicionar ao plano em', tipo: 'date', value: hoje, min: hoje });
  const botaoAdicionar = h('button', { class: 'btn', type: 'button' }, 'Adicionar ao plano');
  botaoAdicionar.addEventListener('click', () =>
    executarComBotao(botaoAdicionar, mensagem, async () => {
      if (!data.input.value) throw new Error('Escolha a data do treino.');
      await adicionarModeloAoPlano({ uid, modelo, data: data.input.value, configs });
      mensagem.mostrar(`Treino adicionado ao plano em ${formatarData(data.input.value)}.`, 'ok');
    }),
  );

  // ---- exportar ----
  const botaoExportar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Exportar para o relógio (.fit)');
  botaoExportar.addEventListener('click', () => {
    mensagem.limpar();
    try {
      const { bytes, nomeArquivo } = gerarFitDoTreino(modelo, { config });
      baixarArquivo(bytes, nomeArquivo, 'application/vnd.ant.fit');
      mensagem.mostrar(
        config
          ? `Arquivo ${nomeArquivo} gerado, com a faixa de FC de cada zona. Copie para a pasta de treinos do aparelho (Garmin: NewFiles) ou importe no Garmin Connect.`
          : `Arquivo ${nomeArquivo} gerado sem faixa de FC (cadastre a configuração de FC para incluir). Copie para a pasta de treinos do aparelho ou importe no Garmin Connect.`,
        'ok',
      );
    } catch (err) {
      mensagem.mostrar(err.message || 'Não foi possível gerar o arquivo.');
    }
  });

  const acoesDoTreino = h(
    'div',
    { class: 'linha-botoes' },
    h('button', { class: 'btn btn-secundario', type: 'button', onClick: () => aoEditar(modelo) }, proprio ? 'Editar' : 'Duplicar e editar'),
    proprio && aoExcluir
      ? h(
          'button',
          {
            class: 'btn btn-perigo',
            type: 'button',
            onClick: async () => {
              if (!(await confirmar({ titulo: 'Excluir este treino?', mensagem: `“${modelo.nome}” será apagado. Os treinos já planejados com ele continuam no plano.`, confirmarTexto: 'Excluir', tipo: 'perigo', icone: 'lixeira' }))) return;
              try {
                await aoExcluir(modelo);
              } catch {
                mensagem.mostrar('Não foi possível excluir o treino.');
              }
            },
          },
          'Excluir',
        )
      : null,
  );

  return h(
    'section',
    { class: 'card treino-detalhe', id: 'treino-detalhe' },
    h(
      'div',
      { class: 'bloco-topo' },
      h('div', null, h('h2', null, modelo.nome), modelo.especificacao ? h('p', { class: 'treino-apelido' }, modelo.especificacao) : null),
      h('button', { class: 'btn btn-secundario', type: 'button', onClick: aoFechar }, 'Fechar'),
    ),
    h(
      'p',
      { class: 'texto-secundario' },
      `${ROTULO_ESPORTE[modelo.esporte] ?? modelo.esporte} · ${FOCOS[modelo.foco]?.rotulo ?? modelo.foco} · ${NIVEIS[modelo.nivel] ?? modelo.nivel}${proprio ? ' · seu treino' : ''}`,
    ),
    modelo.descricao ? h('p', null, modelo.descricao) : null,
    perfilDoTreino(modelo.passos, { altura: 90 }),
    h(
      'ul',
      { class: 'treino-numeros' },
      h('li', null, h('span', { class: 'teste-rotulo' }, 'Duração'), h('strong', null, formatarSegundos(resumo.duracaoS))),
      h('li', null, h('span', { class: 'teste-rotulo' }, 'Zona principal'), h('strong', null, resumo.zona)),
      h('li', null, h('span', { class: 'teste-rotulo' }, 'Esforços'), h('strong', null, String(resumo.esforcos))),
      h('li', null, h('span', { class: 'teste-rotulo' }, 'HRSS estimado'), h('strong', null, hrss === null ? '—' : `~${formatarNumero(hrss, 0)}`)),
    ),
    h('h3', { class: 'cg-subtitulo' }, 'Passo a passo'),
    lista,
    hrss === null ? h('p', { class: 'mensagem mensagem-aviso' }, h('span', null, 'Cadastre a configuração de FC em Configuração para ver a faixa de FC de cada zona e o HRSS estimado.')) : null,
    h('div', { class: 'treino-acao-plano' }, data.raiz, botaoAdicionar, botaoExportar),
    mensagem.el,
    acoesDoTreino,
  );
}
