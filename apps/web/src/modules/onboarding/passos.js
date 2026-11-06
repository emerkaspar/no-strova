import {
  calcularImc,
  classificarImc,
  diasEntre,
  estimarFcMax,
  estimarLthr,
  faixaDeFcDaZona,
  LIMITES_CONFIG,
  LIMITES_ROTINA,
  NIVEIS,
  RECURSOS,
  somarDias,
  temRecurso,
  validarMetaPeso,
  ZONAS,
} from '@no-strova/domain';
import { salvarPassoCorpoECoracao, salvarPassoGarmin, salvarPassoMeta, salvarPassoNivel, salvarPassoSemana, salvarPassoVoce } from '../../application/onboarding.js';
import { intervalsSituacao, recalcularHistorico } from '../../core/functions.js';
import { areaMensagem, campo, executarComBotao } from '../../utils/componentes.js';
import { h } from '../../utils/dom.js';
import { formatarData, formatarNumero, hojeIso } from '../../utils/formatters.js';
import { icone } from '../../utils/icones.js';
import { confirmar } from '../../utils/modal.js';
import { conferirLthrNoIntervals } from '../configuracao/lthrIntervals.js';
import { criarCampoDaChave, criarGuiaIntervals } from '../plano/conexaoIntervals.js';

const ABREV = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const NOMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const ROTULO_SEXO = { masculino: 'Masculino', feminino: 'Feminino' };
const ROTULO_ESPORTE = { ciclismo: 'Ciclismo', corrida: 'Corrida', ambos: 'Os dois' };

/** "72,5" → 72.5; vazio ou inválido → null. */
function numero(valor) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  if (texto === '') return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

const paraCampo = (valor) => (valor === null || valor === undefined ? '' : String(valor).replace('.', ','));

/** Grupo de cartões de escolha única (radiogroup). */
function grupoDeOpcoes({ rotulo, opcoes, valor, aoEscolher, classe = '' }) {
  const grupo = h('div', { class: `wz-opcoes ${classe}`.trim(), role: 'radiogroup', 'aria-label': rotulo });
  const botoes = opcoes.map((o) => {
    const b = h(
      'button',
      { type: 'button', class: 'wz-opcao', role: 'radio', 'aria-checked': String(o.valor === valor), onClick: () => escolher(o.valor) },
      h('strong', null, o.titulo),
      o.texto ? h('span', null, o.texto) : null,
    );
    b.dataset.valor = o.valor;
    return b;
  });
  function escolher(novo) {
    for (const b of botoes) b.setAttribute('aria-checked', String(b.dataset.valor === novo));
    aoEscolher(novo);
  }
  grupo.append(...botoes);
  return grupo;
}

/** Estado inicial do wizard a partir do que já está salvo (assim revisitar não começa do zero). */
export function estadoInicial(sessao, dados) {
  const c = dados.configs[0] ?? null;
  const p = dados.preferencias ?? {};
  const meta = dados.metaPesoAtiva;
  return {
    nome: sessao.perfil?.nome || sessao.nomeSugerido || '',
    nascimento: sessao.perfil?.dataNascimento ?? '',
    sexo: c?.sexo ?? '',
    pesoKg: paraCampo(c?.pesoKg ?? dados.pesagens.at(-1)?.pesoKg),
    alturaCm: paraCampo(c?.alturaCm),
    fcRepouso: paraCampo(c?.fcRepouso),
    fcMax: paraCampo(c?.fcMax),
    lthr: paraCampo(c?.lthr),
    estimado: false,
    nivel: p.nivelTreinos ?? '',
    esporte: p.esportePrincipal ?? 'ambos',
    dias: new Set(p.diasTreino ?? []),
    longao: p.diaLongao ?? null,
    horas: p.horasSemana ?? 6,
    usoGarmin: p.usoGarmin ?? '',
    querMeta: Boolean(meta),
    metaPeso: paraCampo(meta?.pesoAlvoKg),
    metaData: meta?.dataAlvo ?? '',
    configAlterada: false,
  };
}

/**
 * Passos do wizard. Cada passo: { id, rotulo, eyebrow, titulo, subtitulo, raiz, continuar?, textoContinuar? }. `continuar`
 * valida e grava o que o passo coleta (lança Error em português); o que foi gravado fica salvo mesmo se o usuário sair.
 * `revisao`: perfil já preenchido, o wizard abre no resumo (visualização) e cada "Editar" volta a ele ao salvar.
 * @param {{ uid: string, sessao: any, dados: any, estado: any, irPara: (id: string) => void, concluir: () => Promise<void>, revisao?: boolean }} ctx
 */
export function criarPassos({ uid, sessao, dados, estado, irPara, concluir, revisao = false }) {
  // ---------- boas-vindas ----------
  const boasVindas = {
    id: 'inicio',
    rotulo: 'Boas-vindas',
    eyebrow: 'Antes de treinar',
    titulo: 'Bora acertar esses números.',
    subtitulo: 'Sete perguntas rápidas. Em troca, o app para de chutar o seu estresse, as suas zonas e o seu plano.',
    textoContinuar: 'Começar',
    raiz: h(
      'ul',
      { class: 'wz-vantagens' },
      ...[
        ['configuracao', 'Zonas e HRSS certos', 'Sem os seus números, tudo vira estimativa genérica.'],
        ['plano', 'Plano na sua rotina', 'Dias, longão e horas: o app monta em cima do que você realmente faz.'],
        ['peso', 'Meta de peso com os pés no chão', 'Com limite de segurança. Nada de milagre.'],
      ].map(([ic, titulo, texto]) => h('li', null, h('span', { class: 'wz-icone' }, icone(ic, 22)), h('div', null, h('strong', null, titulo), h('p', null, texto)))),
      h('li', { class: 'wz-vantagens-nota' }, 'Leva uns 3 minutos. Dá para pular e voltar depois, pelo menu da conta.'),
    ),
  };

  // ---------- você ----------
  const nome = campo({ id: 'wz-nome', rotulo: 'Nome', autocomplete: 'name', maxlength: 80, value: estado.nome, placeholder: 'Como te chamam' });
  const nascimento = campo({
    id: 'wz-nasc',
    rotulo: 'Data de nascimento',
    tipo: 'date',
    autocomplete: 'bday',
    value: estado.nascimento,
    dica: 'Serve para estimar a FC máxima e as calorias. Fica só com você.',
  });
  nome.input.addEventListener('input', () => (estado.nome = nome.input.value));
  nascimento.input.addEventListener('input', () => (estado.nascimento = nascimento.input.value));
  const voce = {
    id: 'voce',
    rotulo: 'Você',
    eyebrow: 'Você',
    titulo: 'Quem é você, afinal?',
    subtitulo: 'Só o nome e o aniversário. Foto de perfil nem pensar.',
    raiz: h('div', { class: 'wz-campos' }, nome.raiz, nascimento.raiz),
    foco: nome.input,
    async continuar() {
      await salvarPassoVoce({ uid, nome: estado.nome, dataNascimento: estado.nascimento });
      sessao.perfil = { ...(sessao.perfil ?? {}), nome: estado.nome.trim(), dataNascimento: estado.nascimento || null };
    },
  };

  // ---------- corpo ----------
  const peso = campo({ id: 'wz-peso', rotulo: 'Peso (kg)', inputmode: 'decimal', value: estado.pesoKg, placeholder: '72,5' });
  const altura = campo({ id: 'wz-altura', rotulo: 'Altura (cm)', inputmode: 'decimal', value: estado.alturaCm, placeholder: '175' });
  const imc = h('p', { class: 'wz-chip', 'aria-live': 'polite' });
  function atualizarImc() {
    const v = calcularImc(numero(estado.pesoKg), numero(estado.alturaCm));
    imc.hidden = v === null;
    imc.textContent = v === null ? '' : `IMC ${formatarNumero(v, 1)} · ${classificarImc(v)}`;
  }
  peso.input.addEventListener('input', () => {
    estado.pesoKg = peso.input.value;
    atualizarImc();
  });
  altura.input.addEventListener('input', () => {
    estado.alturaCm = altura.input.value;
    atualizarImc();
  });
  atualizarImc();
  const corpo = {
    id: 'corpo',
    rotulo: 'Corpo',
    eyebrow: 'Seu corpo',
    titulo: 'Sem julgamento. Só números.',
    subtitulo: 'Peso e altura entram no gasto calórico, no IMC e nos limites de segurança das metas.',
    raiz: h(
      'div',
      { class: 'wz-campos' },
      h(
        'div',
        { class: 'campo' },
        h('span', { class: 'wz-rotulo', id: 'wz-sexo-rotulo' }, 'Sexo'),
        grupoDeOpcoes({
          rotulo: 'Sexo',
          valor: estado.sexo,
          classe: 'wz-opcoes-2',
          aoEscolher: (v) => (estado.sexo = v),
          opcoes: [
            { valor: 'masculino', titulo: 'Masculino' },
            { valor: 'feminino', titulo: 'Feminino' },
          ],
        }),
        h('small', { class: 'dica' }, 'Só define uma constante do cálculo do TRIMP (1,92 ou 1,67). Não é pegadinha.'),
      ),
      h('div', { class: 'wz-linha' }, peso.raiz, altura.raiz),
      imc,
    ),
    foco: peso.input,
    continuar() {
      const L = LIMITES_CONFIG;
      if (!ROTULO_SEXO[estado.sexo]) throw new Error('Escolha o sexo (usado na constante do TRIMP).');
      const p = numero(estado.pesoKg);
      if (p === null || p < L.pesoKg.min || p > L.pesoKg.max) throw new Error(`Peso deve estar entre ${L.pesoKg.min} e ${L.pesoKg.max} kg.`);
      const a = numero(estado.alturaCm);
      if (a === null || a < L.alturaCm.min || a > L.alturaCm.max) throw new Error(`Altura deve estar entre ${L.alturaCm.min} e ${L.alturaCm.max} cm.`);
    },
  };

  // ---------- coração ----------
  const fcRepouso = campo({ id: 'wz-repouso', rotulo: 'FC de repouso (bpm)', inputmode: 'numeric', value: estado.fcRepouso, placeholder: '55' });
  const fcMax = campo({ id: 'wz-fcmax', rotulo: 'FC máxima (bpm)', inputmode: 'numeric', value: estado.fcMax, placeholder: '185' });
  const lthr = campo({ id: 'wz-lthr', rotulo: 'LTHR — FC no limiar (bpm)', inputmode: 'numeric', value: estado.lthr, placeholder: '165', dica: 'A maior FC média que você sustenta por cerca de 1 hora.' });
  const zonas = h('div', { class: 'wz-zonas', 'aria-live': 'polite' });
  const notaEstimado = h('p', { class: 'wz-nota', hidden: true }, 'Valores estimados pela sua idade. Funcionam de começo, mas o teste de LTHR (em Configuração) acerta bem mais.');
  const mensagemEstimar = areaMensagem();
  function desenharZonas() {
    const config = { lthr: numero(estado.lthr), fcMax: numero(estado.fcMax) };
    const valido = Number.isInteger(config.lthr) && Number.isInteger(config.fcMax) && config.lthr > 0 && config.fcMax >= config.lthr;
    notaEstimado.hidden = !estado.estimado;
    if (!valido) {
      zonas.replaceChildren(h('p', { class: 'wz-vazio' }, 'Preencha a FC máxima e o LTHR para ver as suas zonas.'));
      return;
    }
    zonas.replaceChildren(
      ...Object.keys(ZONAS).map((z) => {
        const [de, ate] = faixaDeFcDaZona(z, config);
        return h('div', { class: 'wz-zona', style: `--cor: var(--zona-${z.slice(1)})` }, h('strong', null, z), h('span', null, `${de}–${ate}`), h('small', null, ZONAS[z].rotulo.split('—')[1].trim()));
      }),
    );
  }
  for (const [chave, el, manual] of [['fcRepouso', fcRepouso, false], ['fcMax', fcMax, true], ['lthr', lthr, true]]) {
    el.input.addEventListener('input', () => {
      estado[chave] = el.input.value;
      if (manual) estado.estimado = false;
      desenharZonas();
    });
  }
  const botaoEstimar = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Não sei: estimar pra mim');
  botaoEstimar.addEventListener('click', () => {
    mensagemEstimar.limpar();
    const max = estimarFcMax(estado.nascimento);
    if (max === null) {
      mensagemEstimar.mostrar('Preciso da sua data de nascimento para estimar. Volte um passo e preencha.');
      return;
    }
    const limiar = estimarLthr(max, numero(estado.fcRepouso));
    estado.fcMax = String(max);
    estado.lthr = limiar === null ? estado.lthr : String(limiar);
    fcMax.input.value = estado.fcMax;
    lthr.input.value = estado.lthr;
    estado.estimado = true;
    if (limiar === null) mensagemEstimar.mostrar('Estimei a FC máxima, mas o LTHR ficaria abaixo da FC de repouso. Confira os números.');
    desenharZonas();
  });
  desenharZonas();
  const coracao = {
    id: 'coracao',
    rotulo: 'Coração',
    eyebrow: 'Seu coração',
    titulo: 'O número que manda em tudo.',
    subtitulo: 'A FC de repouso, a máxima e o LTHR definem as suas zonas e o HRSS de cada treino.',
    raiz: h(
      'div',
      { class: 'wz-campos' },
      h('div', { class: 'wz-linha wz-linha-3' }, fcRepouso.raiz, fcMax.raiz, lthr.raiz),
      h('div', { class: 'wz-acoes-linha' }, botaoEstimar, h('small', { class: 'dica' }, 'Repouso: meça ao acordar, ainda deitado, por 3 dias e tire a média.')),
      mensagemEstimar.el,
      notaEstimado,
      zonas,
      dados.configs.length > 0 ? h('p', { class: 'wz-nota' }, 'Se os números mudarem, valem a partir de hoje. O histórico não muda sozinho: você recalcula no fim, se quiser.') : null,
    ),
    foco: fcRepouso.input,
    async continuar() {
      const r = await salvarPassoCorpoECoracao({
        uid,
        dados,
        entrada: { sexo: estado.sexo, pesoKg: estado.pesoKg, alturaCm: estado.alturaCm, fcMax: estado.fcMax, fcRepouso: estado.fcRepouso, lthr: estado.lthr },
      });
      if (r.alterou) {
        estado.configAlterada = true;
        // para quem envia treinos ao Garmin pelo intervals.icu: confere o LTHR de lá e oferece atualizar
        await conferirLthrNoIntervals();
      }
    },
  };

  // ---------- nível ----------
  const nivel = {
    id: 'nivel',
    rotulo: 'Nível',
    eyebrow: 'Seu nível',
    titulo: 'Seja honesto. Ninguém está olhando.',
    subtitulo: 'As sugestões de treino escolhem a dificuldade por aqui.',
    raiz: h(
      'div',
      { class: 'wz-campos' },
      grupoDeOpcoes({
        rotulo: 'Nível do atleta',
        valor: estado.nivel,
        aoEscolher: (v) => (estado.nivel = v),
        opcoes: [
          { valor: 'iniciante', titulo: NIVEIS.iniciante, texto: 'Começando, ou voltando de uma pausa longa.' },
          { valor: 'intermediario', titulo: NIVEIS.intermediario, texto: 'Treina com regularidade há um bom tempo.' },
          { valor: 'avancado', titulo: NIVEIS.avancado, texto: 'Intervalado é programa de fim de semana.' },
        ],
      }),
      h(
        'div',
        { class: 'campo' },
        h('span', { class: 'wz-rotulo' }, 'Esporte principal'),
        grupoDeOpcoes({
          rotulo: 'Esporte principal',
          valor: estado.esporte,
          classe: 'wz-opcoes-3 wz-opcoes-curtas',
          aoEscolher: (v) => (estado.esporte = v),
          opcoes: Object.entries(ROTULO_ESPORTE).map(([valor, titulo]) => ({ valor, titulo })),
        }),
      ),
    ),
    async continuar() {
      if (!NIVEIS[estado.nivel]) throw new Error('Escolha um nível. Mentir para si mesmo não conta como opção.');
      await salvarPassoNivel({ uid, nivel: estado.nivel, esporte: estado.esporte });
    },
  };

  // ---------- semana ----------
  const resumoSemana = h('p', { class: 'wz-chip', 'aria-live': 'polite' });
  const grade = h('div', { class: 'wz-dias', role: 'group', 'aria-label': 'Dias da semana em que você quer treinar' });
  const linhaLongao = h('div', { class: 'campo' });
  const horasSaida = h('output', { class: 'wz-horas-valor', for: 'wz-horas' });
  const horasRange = h('input', { id: 'wz-horas', type: 'range', min: String(LIMITES_ROTINA.horasMin), max: String(LIMITES_ROTINA.horasMax), step: '0.5', value: String(estado.horas) });
  function desenharSemana() {
    const ordenados = [...estado.dias].sort((a, b) => a - b);
    if (estado.longao !== null && !estado.dias.has(estado.longao)) estado.longao = null;
    grade.replaceChildren(
      ...ABREV.map((rotulo, d) =>
        h(
          'button',
          {
            type: 'button',
            class: 'wz-dia',
            'aria-pressed': String(estado.dias.has(d)),
            'aria-label': `${NOMES[d]}${estado.longao === d ? ', dia do longão' : ''}`,
            onClick: () => {
              if (estado.dias.has(d)) estado.dias.delete(d);
              else estado.dias.add(d);
              desenharSemana();
            },
          },
          h('strong', null, rotulo),
          estado.longao === d ? h('span', { class: 'wz-longao', 'aria-hidden': 'true' }, 'longão') : null,
        ),
      ),
    );
    linhaLongao.replaceChildren(
      h('span', { class: 'wz-rotulo' }, 'Qual é o dia do longão?'),
      h(
        'div',
        { class: 'wz-chips', role: 'radiogroup', 'aria-label': 'Dia do longão' },
        ...[{ valor: null, rotulo: 'Sem longão' }, ...ordenados.map((d) => ({ valor: d, rotulo: NOMES[d].charAt(0).toUpperCase() + NOMES[d].slice(1) }))].map((o) =>
          h(
            'button',
            {
              type: 'button',
              class: 'wz-chip-botao',
              role: 'radio',
              'aria-checked': String(estado.longao === o.valor),
              onClick: () => {
                estado.longao = o.valor;
                desenharSemana();
              },
            },
            o.rotulo,
          ),
        ),
      ),
    );
    const n = ordenados.length;
    const horas = formatarNumero(estado.horas, estado.horas % 1 === 0 ? 0 : 1);
    resumoSemana.textContent =
      n === 0 ? 'Nenhum dia? Descanso total, então.' : `${n} ${n === 1 ? 'dia' : 'dias'} · ${horas} h por semana${estado.longao === null ? '' : ` · longão de ${NOMES[estado.longao]}`}`;
    horasSaida.textContent = `${horas} h`;
  }
  horasRange.addEventListener('input', () => {
    estado.horas = Number(horasRange.value);
    desenharSemana();
  });
  desenharSemana();
  const semana = {
    id: 'semana',
    rotulo: 'Semana',
    eyebrow: 'Sua semana',
    titulo: 'Quando dá pra treinar?',
    subtitulo: 'Marque os dias possíveis, não os desejados. O longão é o treino mais comprido da semana.',
    raiz: h(
      'div',
      { class: 'wz-campos' },
      h('div', { class: 'campo' }, h('span', { class: 'wz-rotulo' }, 'Dias de treino'), grade),
      linhaLongao,
      h('div', { class: 'campo' }, h('label', { class: 'wz-rotulo', for: 'wz-horas' }, 'Horas por semana'), h('div', { class: 'wz-horas' }, horasRange, horasSaida)),
      resumoSemana,
    ),
    async continuar() {
      await salvarPassoSemana({ uid, entrada: { diasTreino: [...estado.dias], diaLongao: estado.longao, horasSemana: estado.horas, esportePrincipal: estado.esporte } });
    },
  };

  // ---------- meta de peso ----------
  const metaPeso = campo({ id: 'wz-meta-peso', rotulo: 'Peso desejado (kg)', inputmode: 'decimal', value: estado.metaPeso, placeholder: '70' });
  const metaData = campo({ id: 'wz-meta-data', rotulo: 'Até quando', tipo: 'date', value: estado.metaData, min: somarDias(hojeIso(), 1) });
  const veredito = h('p', { class: 'wz-veredito', 'aria-live': 'polite' });
  const camposMeta = h('div', { class: 'wz-campos' });
  function avaliarMeta() {
    veredito.className = 'wz-veredito';
    veredito.textContent = '';
    if (!estado.querMeta || (estado.metaPeso === '' && estado.metaData === '')) return;
    const atual = numero(estado.pesoKg);
    const r = validarMetaPeso({ pesoAlvoKg: estado.metaPeso, dataAlvo: estado.metaData }, { pesoAtualKg: atual, alturaCm: numero(estado.alturaCm) }, hojeIso());
    if (!r.valido) {
      if (estado.metaPeso !== '' && estado.metaData !== '') {
        veredito.classList.add('wz-veredito-erro');
        veredito.textContent = r.erros.join(' ');
      }
      return;
    }
    const semanas = diasEntre(hojeIso(), r.valores.dataAlvo) / 7;
    const dif = r.valores.pesoAlvoKg - (atual ?? r.valores.pesoAlvoKg);
    const ritmo = semanas > 0 ? Math.abs(dif) / semanas : 0;
    const direcao = dif < 0 ? 'Perder' : dif > 0 ? 'Ganhar' : 'Manter';
    const base = dif === 0 ? 'Manter o peso atual até lá.' : `${direcao} ${formatarNumero(Math.abs(dif), 1)} kg em ${formatarNumero(semanas, 0)} semanas dá ${formatarNumero(ritmo, 2)} kg por semana.`;
    veredito.textContent = [base, ...r.avisos].join(' ');
    veredito.classList.add(r.avisos.length > 0 ? 'wz-veredito-aviso' : 'wz-veredito-ok');
  }
  metaPeso.input.addEventListener('input', () => {
    estado.metaPeso = metaPeso.input.value;
    avaliarMeta();
  });
  metaData.input.addEventListener('input', () => {
    estado.metaData = metaData.input.value;
    avaliarMeta();
  });
  const atalhos = h(
    'div',
    { class: 'wz-chips', role: 'group', 'aria-label': 'Atalhos de prazo' },
    ...[['8 semanas', 56], ['12 semanas', 84], ['6 meses', 182]].map(([rotulo, dias]) =>
      h('button', { type: 'button', class: 'wz-chip-botao', onClick: () => {
        estado.metaData = somarDias(hojeIso(), dias);
        metaData.input.value = estado.metaData;
        avaliarMeta();
      } }, rotulo),
    ),
  );
  camposMeta.append(h('div', { class: 'wz-linha' }, metaPeso.raiz, metaData.raiz), atalhos, veredito);
  const alternarMeta = grupoDeOpcoes({
    rotulo: 'Meta de peso',
    valor: estado.querMeta ? 'sim' : 'nao',
    classe: 'wz-opcoes-2 wz-opcoes-curtas',
    aoEscolher: (v) => {
      estado.querMeta = v === 'sim';
      camposMeta.hidden = !estado.querMeta;
      avaliarMeta();
    },
    opcoes: [
      { valor: 'sim', titulo: 'Tenho uma meta' },
      { valor: 'nao', titulo: 'Agora não' },
    ],
  });
  camposMeta.hidden = !estado.querMeta;
  avaliarMeta();
  const meta = {
    id: 'meta',
    rotulo: 'Meta',
    eyebrow: 'Sua meta',
    titulo: 'Quer emagrecer, ganhar ou só manter?',
    subtitulo: 'Opcional. Se tiver meta, o app confere se o ritmo é seguro: no máximo 1% do peso por semana e IMC acima de 18,5.',
    raiz: h('div', { class: 'wz-campos' }, alternarMeta, camposMeta),
    async continuar() {
      if (!estado.querMeta) return;
      const ativa = dados.metaPesoAtiva;
      const alvo = numero(estado.metaPeso);
      if (ativa && alvo === ativa.pesoAlvoKg && estado.metaData === ativa.dataAlvo) return; // nada mudou
      await salvarPassoMeta({ uid, pesoAlvoKg: estado.metaPeso, dataAlvo: estado.metaData, dados, alturaCm: numero(estado.alturaCm) });
      dados.metaPesoAtiva = { pesoAlvoKg: alvo, dataAlvo: estado.metaData, status: 'ativa' };
    },
  };

  // ---------- Garmin (opcional, mas importante para quem treina com relógio) ----------
  const ROTULO_USO_GARMIN = { sim: 'Uso o Garmin', nao: 'Não uso', depois: 'Decido depois' };
  const liberadoGarmin = temRecurso(sessao.perfil, RECURSOS.GARMIN);
  const detalheGarmin = h('div', { class: 'wz-garmin-detalhe', 'aria-live': 'polite' });
  const mensagemGarmin = areaMensagem();
  async function desenharDetalheGarmin() {
    detalheGarmin.hidden = estado.usoGarmin !== 'sim';
    if (estado.usoGarmin !== 'sim') return;
    if (!liberadoGarmin) {
      detalheGarmin.replaceChildren(
        h('p', { class: 'wz-nota' }, 'Esse recurso (“Sincronização com o Garmin”) precisa ser liberado pelo administrador do app. Peça a liberação e volte aqui depois, pelo menu da conta → Perfil de treino. A sua escolha fica salva. Enquanto isso, já dá para deixar o intervals.icu pronto:'),
        criarGuiaIntervals({ comCampo: false }),
      );
      return;
    }
    detalheGarmin.replaceChildren(h('p', { class: 'wz-nota', role: 'status' }, 'Verificando a conexão…'));
    let situacao = null;
    try {
      situacao = await intervalsSituacao();
    } catch {
      situacao = { conectado: false };
    }
    if (situacao.conectado) {
      detalheGarmin.replaceChildren(
        h('p', { class: 'mensagem mensagem-ok' }, `Conectado ao intervals.icu${situacao.atleta ? ` como ${situacao.atleta}` : ''}. Para enviar os treinos: Plano → Enviar para o Garmin.`),
        h('p', { class: 'wz-nota' }, `Confira em Settings do intervals.icu (na configuração do esporte) se o LTHR é ${estado.lthr || 'o mesmo do seu perfil'}${estado.lthr ? ' bpm' : ''}: as faixas de FC dos treinos só batem se forem iguais.`),
      );
      return;
    }
    detalheGarmin.replaceChildren(
      h('p', { class: 'wz-nota' }, 'Configuração, uma vez só (leva uns 5 minutos):'),
      criarGuiaIntervals(),
      criarCampoDaChave({ mensagem: mensagemGarmin, aoConectado: desenharDetalheGarmin, idCampo: 'wz-int-chave', comoFormulario: false }),
      mensagemGarmin.el,
      h('p', { class: 'wz-nota' }, `Depois de conectar, confira em Settings do intervals.icu (na configuração do esporte) se o LTHR é ${estado.lthr || 'o mesmo do seu perfil'}${estado.lthr ? ' bpm' : ''}. Dá para pular e fazer depois em Plano → Enviar para o Garmin.`),
    );
  }
  const escolhaGarmin = grupoDeOpcoes({
    rotulo: 'Enviar treinos para o Garmin',
    valor: estado.usoGarmin,
    classe: 'wz-opcoes-3',
    aoEscolher: (v) => {
      estado.usoGarmin = v;
      desenharDetalheGarmin();
    },
    opcoes: [
      { valor: 'sim', titulo: 'Uso o Garmin', texto: 'Quero os treinos do plano no meu relógio.' },
      { valor: 'nao', titulo: 'Não uso', texto: 'Sigo só com o app, sem enviar nada.' },
      { valor: 'depois', titulo: 'Decido depois', texto: 'Aviso você mais tarde, no Plano.' },
    ],
  });
  const garmin = {
    id: 'garmin',
    rotulo: 'Garmin',
    eyebrow: 'Seu relógio',
    titulo: 'Treino direto no relógio?',
    subtitulo: 'Opcional, mas vale a pena: o app envia os treinos planejados ao Garmin Connect, com a faixa de FC de cada passo, pelo intervals.icu (um site gratuito).',
    raiz: h('div', { class: 'wz-campos' }, escolhaGarmin, detalheGarmin),
    entrar() {
      desenharDetalheGarmin();
    },
    async continuar() {
      // sem escolha, vale "decido depois": o passo nunca trava o perfil
      const uso = estado.usoGarmin || 'depois';
      await salvarPassoGarmin({ uid, uso });
      estado.usoGarmin = uso;
      dados.preferencias = { ...(dados.preferencias ?? {}), usoGarmin: uso };
    },
  };

  // ---------- pronto ----------
  const mensagemFim = areaMensagem();
  const botaoRecalcular = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Recalcular o meu histórico agora');
  botaoRecalcular.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: 'Recalcular o histórico?', mensagem: 'Recalcular o HRSS de todas as atividades com a configuração vigente na data de cada uma? O estresse que você informou manualmente não muda.', confirmarTexto: 'Recalcular', tipo: 'aviso', icone: 'hrss' }))) return;
    executarComBotao(botaoRecalcular, mensagemFim, async () => {
      const r = await recalcularHistorico();
      mensagemFim.mostrar(`${r.atualizadas} de ${r.total} atividade${r.total === 1 ? '' : 's'} atualizada${r.atualizadas === 1 ? '' : 's'}.`, 'ok');
    });
  });
  const resumo = h('div', { class: 'wz-resumo' });
  const pronto = {
    id: 'pronto',
    rotulo: 'Pronto',
    eyebrow: revisao ? 'Seu perfil' : 'Tudo certo',
    titulo: revisao ? 'Seu perfil de treino.' : 'Agora é só treinar.',
    subtitulo: revisao ? 'Estes são os números que o app usa. Use Editar para mudar qualquer item.' : 'Confira o resumo. Dá para editar qualquer item, agora ou depois, pelo menu da conta.',
    textoContinuar: revisao ? 'Fechar' : 'Ir pro Início',
    raiz: h('div', { class: 'wz-campos' }, resumo, mensagemFim.el, h('div', { class: 'wz-recalcular' }, botaoRecalcular, h('small', { class: 'dica' }, 'As atividades já importadas ficam com os números antigos até você recalcular.'))),
    entrar() {
      const itens = [
        ['voce', 'Você', estado.nome.trim() || '—', estado.nascimento ? `Nascimento ${formatarData(estado.nascimento)}` : 'Sem data de nascimento'],
        ['corpo', 'Corpo', `${estado.pesoKg || '—'} kg · ${estado.alturaCm || '—'} cm`, ROTULO_SEXO[estado.sexo] ?? '—'],
        ['coracao', 'Coração', `Máx ${estado.fcMax || '—'} · LTHR ${estado.lthr || '—'}`, `Repouso ${estado.fcRepouso || '—'} bpm${estado.estimado ? ' · estimado' : ''}`],
        ['nivel', 'Nível', NIVEIS[estado.nivel] ?? '—', ROTULO_ESPORTE[estado.esporte]],
        [
          'semana',
          'Semana',
          estado.dias.size === 0 ? '—' : [...estado.dias].sort((a, b) => a - b).map((d) => ABREV[d]).join(' · '),
          `${formatarNumero(estado.horas, estado.horas % 1 === 0 ? 0 : 1)} h${estado.longao === null ? '' : ` · longão de ${NOMES[estado.longao]}`}`,
        ],
        ['garmin', 'Garmin', ROTULO_USO_GARMIN[estado.usoGarmin] ?? '—', estado.usoGarmin === 'sim' ? 'Envio de treinos pelo intervals.icu' : 'Dá para configurar depois'],
        ['meta', 'Meta de peso', estado.querMeta && estado.metaPeso ? `${estado.metaPeso} kg` : 'Sem meta', estado.querMeta && estado.metaData ? `até ${formatarData(estado.metaData)}` : 'Dá para definir depois'],
      ];
      resumo.replaceChildren(
        ...itens.map(([id, rotulo, valor, detalhe]) =>
          h(
            'div',
            { class: 'wz-resumo-item' },
            h('span', { class: 'wz-resumo-rotulo' }, rotulo),
            h('strong', null, valor),
            h('small', null, detalhe),
            h('button', { type: 'button', class: 'btn-link', onClick: () => irPara(id) }, 'Editar'),
          ),
        ),
      );
      botaoRecalcular.parentElement.hidden = !(dados.totalAtividades > 0 && estado.configAlterada);
    },
    continuar: concluir,
  };

  return [boasVindas, voce, corpo, coracao, nivel, semana, garmin, meta, pronto];
}
