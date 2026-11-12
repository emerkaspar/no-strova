/**
 * Desenhos dos personagens padrão (SVG 100×100, estilizados e feitos para este app). O catálogo (id, nome, cor de fundo)
 * mora em @no-strova/domain; aqui só o desenho de cada rosto. Os SVGs são texto fixo, sem dado do usuário.
 */

const PELE = '#f3c9a1';
const OLHOS = (y = 50, dx = 11) =>
  `<circle cx="${50 - dx}" cy="${y}" r="4.6" fill="#fff"/><circle cx="${50 + dx}" cy="${y}" r="4.6" fill="#fff"/><circle cx="${50 - dx}" cy="${y}" r="2" fill="#111"/><circle cx="${50 + dx}" cy="${y}" r="2" fill="#111"/>`;
const ROSTO = (cor = PELE, ry = 27) => `<ellipse cx="50" cy="58" rx="25" ry="${ry}" fill="${cor}"/>`;

const DESENHOS = {
  // chapéu preto, capa roxa, bigode fino e cara de vilão
  'dick-vigarista': `<path d="M10 100c4-18 20-22 40-22s36 4 40 22z" fill="#7a3fb0"/>${ROSTO()}
    <rect x="30" y="18" width="40" height="24" rx="4" fill="#161616"/><rect x="22" y="38" width="56" height="8" rx="4" fill="#161616"/><rect x="30" y="34" width="40" height="4" fill="#7a3fb0"/>
    ${OLHOS(54, 10)}<path d="M35 46l12 4M65 46l-12 4" stroke="#161616" stroke-width="3" stroke-linecap="round"/>
    <path d="M34 66q8-6 16 0q8-6 16 0" fill="none" stroke="#161616" stroke-width="3" stroke-linecap="round"/><path d="M40 72q10 7 20 0" fill="none" stroke="#161616" stroke-width="2.4" stroke-linecap="round"/>`,
  // cachorro: orelhas, focinho, nariz grande e dentes à mostra
  muttley: `<path d="M20 44l-8-24 24 10zM80 44l8-24-24 10z" fill="#8a5a2b"/>${ROSTO('#a8713a', 28)}
    <ellipse cx="50" cy="68" rx="19" ry="14" fill="#dcb98a"/><ellipse cx="50" cy="60" rx="7" ry="5" fill="#111"/>
    ${OLHOS(46, 12)}<path d="M33 73q17 14 34 0z" fill="#fff" stroke="#111" stroke-width="2"/><path d="M42 73v6M50 74v7M58 73v6" stroke="#111" stroke-width="1.6"/>`,
  // cabelo loiro volumoso, chapéu rosa, cílios e batom
  'penelope-charmosa': `<path d="M18 92c-8-30-2-62 32-62s40 32 32 62z" fill="#f6cf4e"/>${ROSTO('#f8d2b0', 25)}
    <path d="M22 40q28-26 56 0l-4 6q-24-12-48 0z" fill="#ff3d8f"/><circle cx="50" cy="22" r="5" fill="#ff3d8f"/>
    ${OLHOS(54, 10)}<path d="M35 49l-4-3M65 49l4-3M38 47l-2-4M62 47l2-4" stroke="#111" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M42 68q8 7 16 0q-8-3-16 0z" fill="#d8133e"/>`,
  // homem das cavernas: cabelo desgrenhado, sobrancelha pesada, barba por fazer e pele de animal
  'irmaos-rocha': `<path d="M12 100c2-14 16-20 38-20s36 6 38 20z" fill="#b8793a"/>${ROSTO('#e0a878', 28)}
    <path d="M24 44c-6-22 12-30 26-26 14-4 32 4 26 26-6-10-16-14-26-14s-20 4-26 14z" fill="#4a2c14"/>
    <path d="M32 47h14M54 47h14" stroke="#2a170a" stroke-width="5" stroke-linecap="round"/>${OLHOS(54, 10)}
    <path d="M30 70q20 16 40 0" fill="#5a3a20" opacity=".55"/><path d="M42 72q8 4 16 0" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>`,
  // cientista: tufos brancos, óculos redondos e óculos de proteção na testa
  'professor-aereo': `<path d="M22 56c-8-4-8-18 0-22M78 56c8-4 8-18 0-22" fill="#eee" stroke="#ccc"/>${ROSTO(PELE, 26)}
    <path d="M26 38q24-22 48 0" fill="none" stroke="#333" stroke-width="5"/><circle cx="40" cy="34" r="7" fill="#9cd3ff" stroke="#333" stroke-width="3"/><circle cx="60" cy="34" r="7" fill="#9cd3ff" stroke="#333" stroke-width="3"/>
    <circle cx="39" cy="55" r="9" fill="#fff" fill-opacity=".6" stroke="#222" stroke-width="2.4"/><circle cx="61" cy="55" r="9" fill="#fff" fill-opacity=".6" stroke="#222" stroke-width="2.4"/><path d="M48 55h4" stroke="#222" stroke-width="2.4"/>
    <circle cx="39" cy="55" r="2" fill="#111"/><circle cx="61" cy="55" r="2" fill="#111"/><path d="M36 70q14 6 28 0" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/><path d="M40 66q10-4 20 0" fill="none" stroke="#eee" stroke-width="3.2" stroke-linecap="round"/>`,
  // capacete de corrida branco com faixa vermelha, viseira e sorriso de campeão
  'peter-perfeito': `${ROSTO('#f6d0aa', 25)}<path d="M22 54C20 22 80 22 78 54z" fill="#f4f4f4"/><path d="M22 46h56v7H22z" fill="#e53935"/><path d="M47 20h6v26h-6z" fill="#e53935"/>
    <path d="M28 54h44v6q-22 6-44 0z" fill="#1b2a49" opacity=".85"/>${OLHOS(66, 10)}<path d="M36 74q14 11 28 0z" fill="#fff" stroke="#111" stroke-width="2"/><path d="M36 69q6-3 12-1M52 68q6-2 12 1" stroke="#222" stroke-width="2" fill="none"/>`,
  // capacete militar verde, queixo quadrado e cara fechada
  'sargento-bombarda': `<rect x="26" y="34" width="48" height="46" rx="12" fill="#e7b78d"/><path d="M20 52C20 14 80 14 80 52z" fill="#5d7a3a"/><rect x="18" y="48" width="64" height="7" rx="3" fill="#3f5527"/>
    <path d="M34 60l12 3M66 60l-12 3" stroke="#111" stroke-width="3.4" stroke-linecap="round"/>${OLHOS(66, 10)}<path d="M38 77h24" stroke="#111" stroke-width="3" stroke-linecap="round"/>`,
  // gângster: chapéu preto de aba larga, sombra no rosto e bigode
  'quadrilha-da-morte': `<path d="M10 100c4-14 18-20 40-20s36 6 40 20z" fill="#111"/>${ROSTO('#d9ab84', 26)}
    <path d="M26 44h48v-6q-6-22-24-22T26 38z" fill="#161616"/><rect x="14" y="42" width="72" height="8" rx="4" fill="#161616"/><rect x="26" y="36" width="48" height="5" fill="#8a1f1f"/>
    <path d="M30 56h40v9H30z" fill="#000" opacity=".25"/>${OLHOS(58, 10)}<path d="M36 70q14-8 28 0" fill="none" stroke="#111" stroke-width="3.4" stroke-linecap="round"/><path d="M42 76h16" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>`,
  // aviador: boné vermelho, óculos na testa, cachecol branco e monóculo
  'barao-vermelho': `<path d="M18 98c4-12 18-16 32-16s28 4 32 16z" fill="#fff"/>${ROSTO('#f0c39c', 26)}
    <path d="M22 50C20 18 80 18 78 50q-28-8-56 0z" fill="#c62828"/><rect x="22" y="44" width="56" height="8" rx="3" fill="#7f1414"/><circle cx="38" cy="40" r="6" fill="#bfe3ff" stroke="#222" stroke-width="2.6"/><circle cx="62" cy="40" r="6" fill="#bfe3ff" stroke="#222" stroke-width="2.6"/>
    ${OLHOS(58, 10)}<circle cx="61" cy="58" r="8" fill="none" stroke="#c8a000" stroke-width="2.4"/><path d="M34 70q16-8 32 0" fill="none" stroke="#6b3a12" stroke-width="3.4" stroke-linecap="round"/><path d="M42 74q8 4 16 0" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>`,
  // lenhador: gorro xadrez vermelho e barba cheia
  'rufus-lenhador': `<path d="M24 56c-6 30 10 40 26 40s32-10 26-40z" fill="#6b3d1a"/>${ROSTO('#e8b48a', 24)}
    <path d="M24 46C24 16 76 16 76 46z" fill="#c62828"/><path d="M24 38h52M24 30h52M36 20v26M50 16v30M64 20v26" stroke="#111" stroke-width="2" opacity=".5"/><rect x="22" y="44" width="56" height="7" rx="3" fill="#111"/>
    ${OLHOS(56, 10)}<path d="M30 68q20 18 40 0q-20 6-40 0z" fill="#6b3d1a"/><path d="M42 70q8 4 16 0" fill="none" stroke="#e8b48a" stroke-width="2.6" stroke-linecap="round"/>`,
  // criatura verde de orelhas pontudas e presas
  'dupla-sinistra': `<path d="M16 56l-10-22 26 12zM84 56l10-22-26 12z" fill="#5da83a"/>${ROSTO('#6fbe45', 27)}
    <path d="M30 40l16 8M70 40l-16 8" stroke="#1d3a0e" stroke-width="4" stroke-linecap="round"/><circle cx="39" cy="52" r="6" fill="#ffe14d"/><circle cx="61" cy="52" r="6" fill="#ffe14d"/><ellipse cx="39" cy="52" rx="1.8" ry="4.6" fill="#111"/><ellipse cx="61" cy="52" rx="1.8" ry="4.6" fill="#111"/>
    <path d="M32 68q18 14 36 0z" fill="#3a1030"/><path d="M38 68l3 7 3-6M56 69l3 6 3-7" fill="#fff"/>`,
  // caipira: chapéu de palha, barba e dente faltando
  'luke-e-blubber': `<path d="M26 58c-4 26 8 36 24 36s28-10 24-36z" fill="#c9742a"/>${ROSTO('#efbb92', 23)}
    <path d="M30 40q20-24 40 0z" fill="#e6c25a"/><ellipse cx="50" cy="42" rx="36" ry="7" fill="#d6ae44"/><path d="M30 40q20 5 40 0" fill="none" stroke="#a6791a" stroke-width="3"/>
    ${OLHOS(56, 10)}<circle cx="50" cy="63" r="3.6" fill="#d98a6a"/><path d="M36 70q14 8 28 0" fill="#7a2b12" stroke="#111" stroke-width="2"/><rect x="47" y="71" width="5" height="4" fill="#fff"/>`,
};

/** Nó <svg> do desenho de reserva (ou null se o id não existir). */
function desenhoSvg(id, fundo) {
  const corpo = DESENHOS[id];
  if (!corpo) return null;
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect width="100" height="100" fill="${fundo}"/>${corpo}</svg>`,
    'image/svg+xml',
  );
  return document.importNode(doc.documentElement, true);
}

/**
 * Imagem do personagem. Se existir `public/avatares/<id>.png` (arte fornecida pelo dono do produto), ela é usada;
 * sem o arquivo, entra o desenho de reserva acima.
 */
export function desenhoDoPersonagem(id, fundo) {
  const reserva = desenhoSvg(id, fundo);
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.src = `${import.meta.env.BASE_URL}avatares/${id}.png`;
  img.addEventListener('error', () => reserva && img.replaceWith(reserva), { once: true });
  // enquanto o arquivo carrega, mostra o fundo do personagem
  img.style.background = fundo;
  return img;
}
