import { RECURSOS, temRecurso } from '@no-strova/domain';
import { garminSituacao, stravaSituacao } from '../../core/functions.js';
import { consumirRetornoStrava } from '../../core/stravaOauth.js';
import { h } from '../../utils/dom.js';
import { criarCartaoGarmin } from './garmin.js';
import { criarCartaoStrava } from './strava.js';

/**
 * Cartão de sincronização de atividades. O usuário usa UMA fonte (Garmin ou Strava): quem tem Garmin costuma mandar
 * tudo ao Strava, e as duas juntas duplicariam as atividades. Com uma fonte conectada mostra só ela; sem nenhuma,
 * pede a escolha (se o administrador liberou as duas). O servidor também recusa conectar a segunda.
 */
export function criarCartaoFonte(sessao) {
  const temGarmin = temRecurso(sessao.perfil, RECURSOS.GARMIN);
  const temStrava = temRecurso(sessao.perfil, RECURSOS.STRAVA);
  if (!temGarmin && !temStrava) return { raiz: null };

  const raiz = h('div');
  const mostrar = (...nos) => raiz.replaceChildren(...nos);
  const ambas = temGarmin && temStrava;

  const garmin = () => mostrar(criarCartaoGarmin({ aoVoltar: ambas ? escolher : null, aoDesconectar: iniciar }).raiz);
  const strava = (retorno = null) => mostrar(criarCartaoStrava({ retorno, aoVoltar: ambas ? escolher : null, aoDesconectar: iniciar }).raiz);

  function escolher() {
    mostrar(
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Sincronização de atividades'),
        h('p', { class: 'texto-secundario' }, 'Escolha de onde trazer as suas atividades. Use uma fonte só: quem tem Garmin costuma mandar tudo ao Strava, e as duas juntas duplicariam as atividades. Dá para trocar depois, desconectando a atual.'),
        h(
          'div',
          { class: 'linha-botoes' },
          h('button', { class: 'btn', type: 'button', onClick: garmin }, 'Garmin Connect'),
          h('button', { class: 'btn', type: 'button', onClick: () => strava() }, 'Strava'),
        ),
      ),
    );
  }

  async function iniciar() {
    // Voltou do Strava (a página abriu com o código de autorização): vai direto ao cartão dele.
    const retorno = temStrava ? consumirRetornoStrava() : null;
    if (retorno) return strava(retorno);

    mostrar(h('section', { class: 'card' }, h('h2', null, 'Sincronização de atividades'), h('p', { class: 'vazio', role: 'status' }, 'Carregando…')));
    const [g, s] = await Promise.all([
      temGarmin ? garminSituacao().catch(() => null) : null,
      temStrava ? stravaSituacao().catch(() => null) : null,
    ]);
    if (g?.conectado) return garmin();
    if (s?.conectado) return strava();
    if (ambas) return escolher();
    return temGarmin ? garmin() : strava();
  }

  iniciar();
  return { raiz };
}
