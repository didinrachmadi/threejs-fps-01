// The DOM HUD: health, ammo, money, timer, score, alive counts, killfeed, the buy
// menu and the overlays. It never touches the simulation; main.js pushes numbers in
// and reads the play / buy callbacks out. Updates are cached so the DOM is only
// touched when a value actually changes.
const BUY_ITEMS = [
  { id: 'vk47', key: '1', name: 'VK-47 Rifle', price: 2700, desc: 'Auto rifle · 36 dmg · 30 rounds' },
  { id: 'raptor', key: '2', name: 'Raptor-9 SMG', price: 1500, desc: 'Fast SMG · 26 dmg · 32 rounds' },
  { id: 'grenade', key: '3', name: 'Frag Grenade', price: 300, desc: 'Throw with G · blast radius 6 m' },
  { id: 'armor', key: '4', name: 'Kevlar Armor', price: 650, desc: 'Halves damage until it breaks' },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'),
    play: $('play'), sub: $('overlay-sub'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    hp: $('hp-value'), hpBar: $('hp-bar'), armor: $('armor-value'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
    ammoBox: $('ammo'), nades: $('nades-value'), money: $('money-value'),
    timer: $('timer-value'), timerLabel: $('timer-label'),
    scoreAlly: $('score-ally'), scoreEnemy: $('score-enemy'), round: $('round-value'),
    aliveAlly: $('alive-ally'), aliveEnemy: $('alive-enemy'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'), message: $('message'),
    progress: $('progress'), progressFill: $('progress-fill'), progressLabel: $('progress-label'),
    buy: $('buy'), buyMoney: $('buy-money'), buyList: $('buy-list'),
    bomb: $('bomb-status'), damage: $('damage-flash'),
  };
  let last = {};
  let hitTimer = 0;
  let messageTimer = 0;
  let bannerTimer = 0;
  let buyHandler = null;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  // Build the buy menu once; prices and affordability update on open.
  for (const item of BUY_ITEMS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.id = item.id;
    row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => buyHandler?.(item.id));
    els.buyList.appendChild(row);
  }

  return {
    BUY_ITEMS,
    setHealth(hp, armor) {
      setText(els.hp, 'hp', String(Math.ceil(hp)));
      setText(els.armor, 'armor', armor > 0 ? `+${Math.ceil(armor)}` : '');
      const pct = Math.max(0, hp);
      if (last.hpPct !== pct) {
        last.hpPct = pct;
        els.hpBar.style.width = `${pct}%`;
        els.hpBar.classList.toggle('low', hp <= 30);
      }
    },
    setAmmo(mag, reserve, name, grenades) {
      setText(els.ammoMag, 'mag', String(mag));
      setText(els.ammoReserve, 'res', reserve === Infinity ? '/ ∞' : `/ ${reserve}`);
      setText(els.weaponName, 'wname', name);
      setText(els.nades, 'nades', `◉ ${grenades}`);
      els.ammoBox.classList.toggle('empty', mag === 0);
    },
    setMoney(n) {
      setText(els.money, 'money', `$${n}`);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(els.timer, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      setText(els.timerLabel, 'tlabel', phase === 'freeze' ? 'BUY TIME' : phase === 'planted' ? 'BOMB' : phase === 'live' ? 'ROUND' : '—');
      els.timer.classList.toggle('urgent', s <= 10 && phase !== 'freeze');
    },
    setScore(ally, enemy, round) {
      setText(els.scoreAlly, 'sa', String(ally));
      setText(els.scoreEnemy, 'se', String(enemy));
      setText(els.round, 'round', `ROUND ${round}`);
    },
    setAlive(ally, enemy) {
      setText(els.aliveAlly, 'aa', `● ${ally}`);
      setText(els.aliveEnemy, 'ae', `● ${enemy}`);
    },
    setSpread(px) {
      els.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      els.damage.classList.add('on');
      setTimeout(() => els.damage.classList.remove('on'), 180);
    },
    killfeed(killer, victim, headshot, killerAlly) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<span class="${killerAlly ? 'ally' : 'enemy'}">${killer}</span><span class="feed-x">${headshot ? '◉' : '✕'}</span><span>${victim}</span>`;
      els.killfeed.prepend(row);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    message(text, ms = 2600) {
      els.message.textContent = text;
      els.message.classList.add('on');
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => els.message.classList.remove('on'), ms);
    },
    banner(title, sub, ms = 3000) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('on'), ms);
    },
    setBombStatus(text) {
      setText(els.bomb, 'bomb', text);
    },
    setProgress(label, fraction) {
      if (fraction === null) {
        els.progress.classList.add('hidden');
        return;
      }
      els.progress.classList.remove('hidden');
      els.progressLabel.textContent = label;
      els.progressFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    showBuy(money) {
      setText(els.buyMoney, 'bmoney', `$${money}`);
      for (const row of els.buyList.children) {
        const item = BUY_ITEMS.find((i) => i.id === row.dataset.id);
        row.classList.toggle('poor', money < item.price);
      }
      els.buy.classList.remove('hidden');
    },
    hideBuy() {
      els.buy.classList.add('hidden');
    },
    get buyOpen() {
      return !els.buy.classList.contains('hidden');
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    showOverlay(mode, data = {}) {
      const copy = {
        start: ['EMBERLINE', 'A tactical round-based FPS. Plant the bomb at Foundry or Silo — or eliminate the Ashen squad. First to 5 rounds takes the match.', 'Click to play'],
        paused: ['Paused', 'Click to resume the round.', 'Click to resume'],
        round: [data.title ?? 'Round over', data.copy ?? '', data.matchOver ? 'Play again' : 'Next round'],
        match: [data.title ?? 'Match over', data.copy ?? '', 'Play again'],
      }[mode];
      els.title.textContent = copy[0];
      els.copy.textContent = copy[1];
      els.play.textContent = copy[2];
      els.sub.textContent = data.sub ?? '';
      els.overlay.hidden = false;
      els.play.focus();
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
  };
}
