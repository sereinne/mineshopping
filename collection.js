(() => {
  const groups = {
    套装: ['スーツ・セットアップ', 'セットアップ', 'Set Up'],
    女装: ['レディースファッション'],
    上衣: ['トップス'],
    下装: ['ボトムス', 'Bottoms'],
    拉链连帽衫: ['Zip Hoodie'],
    夹克: ['Jacket'],
    卫衣: ['Sweatshirt'],
    '长袖 T 恤': ['L/S T-Shirt'],
    'T 恤': ['T-Shirt'],
    棒球帽: ['Cap'],
    项链: ['Necklace'],
    配饰: ['アクセサリー', 'Accessory'],
    套头衫: ['Pullover'],
    针织帽: ['Beanie'],
    新品: ['新着'],
    针织衫: ['ニット'],
    连衣裙: ['ワンピース'],
    衬衫: ['ブラウス'],
    大衣: ['コート'],
    发饰: ['ヘアアクセサリー'],
    袜子: ['ソックス'],
    时尚小物: ['ファッション小物'],
    服装: ['アパレル'],
    包袋与收纳包: ['バッグ・ポーチ'],
    购物袋及其他: ['ショッパー・その他'],
    系列商品: ['コレクション'],
  };
  const normalize = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
  const labels = new Map(Object.entries(groups).flatMap(([label, types]) =>
    types.map(type => [normalize(type), label])));
  window.collectionCategory = type => labels.get(normalize(type)) ?? '其他';

  window.setupBrandFilter = (brands, selectBrand) => {
    const toggle = document.querySelector('#brand-toggle');
    const panel = document.querySelector('#brand-panel');
    const options = document.querySelector('#brand-options');
    const activeLabel = document.querySelector('#brand-current');
    const setOpen = open => {
      toggle.setAttribute('aria-expanded', String(open));
      panel.inert = !open;
      panel.setAttribute('aria-hidden', String(!open));
    };

    toggle.onclick = () => setOpen(toggle.getAttribute('aria-expanded') === 'false');
    toggle.closest('.brand-filter').onkeydown = event => {
      if (event.key !== 'Escape' || panel.inert) return;
      event.preventDefault();
      setOpen(false);
      toggle.focus();
    };
    for (const brand of ['', ...brands]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = brand || '全部品牌';
      button.setAttribute('aria-pressed', String(!brand));
      button.onclick = () => {
        for (const peer of options.children) peer.setAttribute('aria-pressed', String(peer === button));
        activeLabel.textContent = button.textContent;
        setOpen(false);
        toggle.focus();
        selectBrand(brand);
      };
      options.append(button);
    }
  };
})();

window.setupMissttPortrait = () => {
  const portrait = document.querySelector('.collection-portrait');
  if (!portrait?.dataset.outfits) return;

  async function chooseOutfit() {
    const manifest = new URL(portrait.dataset.outfits, location.href);
    const response = await fetch(manifest);
    if (!response.ok) return;
    const { outfits } = await response.json();
    if (!Array.isArray(outfits)) return;

    const choices = [...new Set(outfits.filter(name =>
      typeof name === 'string' && /^[\w.-]+\.(?:png|jpe?g|webp|avif)$/i.test(name)))];
    if (choices.length < 2) return;

    const storageKey = 'meowfield-misstt-outfit';
    let previous;
    try { previous = localStorage.getItem(storageKey); } catch {}
    const fresh = choices.filter(name => name !== previous);
    const name = fresh[Math.floor(Math.random() * fresh.length)];
    const next = new Image();
    next.src = new URL(name, manifest).href;
    await next.decode();
    portrait.dataset.fit = name === 'misstt.png' ? 'original' : 'outfit';
    portrait.src = next.src;
    try { localStorage.setItem(storageKey, name); } catch {}
  }

  chooseOutfit().catch(() => {});
};
