(() => {
  const cover = document.querySelector('.moon-cover');
  const canvas = cover?.querySelector('.meadow');
  if (!canvas) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const brush = canvas.getContext('2d');
  if (!brush) return;

  const picture = new Image();
  const width = canvas.width = 1408;
  const height = canvas.height = 928;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };

  // Positions in the original artwork, following the tops and roots of the grass.
  const stands = [
    { left: 4, right: 95, top: 663, root: 807 },
    { left: 83, right: 209, top: 727, root: 826 },
    { left: 219, right: 349, top: 694, root: 805 },
    { left: 717, right: 872, top: 586, root: 762 },
    { left: 867, right: 938, top: 625, root: 752 },
    { left: 1127, right: 1196, top: 550, root: 699 },
    { left: 1172, right: 1291, top: 482, root: 704 },
    { left: 1231, right: 1408, top: 399, root: 712 },
  ];

  // Precompute how much each part of the image can bend. Keep the cat, its
  // whiskers and tail outside the moving area, even when the gust passes behind it.
  const columns = [];
  for (let x = 0; x < width; x += 8) {
    const center = x + 4;
    const edge = ease(center / 24) * ease((width - center) / 24);
    const front = 790 - center * .135;
    const cells = [];
    for (let y = 398; y < height; y += 5) {
      const row = y + 2.5;
      let bend = 7 * ease((row - front + 36) / 66);
      for (const { left, right, top, root } of stands) {
        if (center <= left || center >= right || row < top || row > root) continue;
        const sides = ease((center - left) / 28) * ease((right - center) / 28);
        bend = Math.max(bend, 12 * sides * ease((row - top) / 30) * ease((root - row) / (root - top)));
      }
      if (center > 913 && center < 1154) {
        const cat = ease((center - 913) / 22) * ease((1154 - center) / 23);
        bend *= 1 - cat * (1 - ease((row - 740) / 25));
      }
      if (bend * edge > .12) cells.push({ y, bend: bend * edge });
    }
    columns.push({ x, cells });
  }

  function grass(seconds) {
    const interval = 3.2;
    const cycle = seconds % interval;
    for (const { x, cells } of columns) {
      // Wrap each column's delay so the next gust enters before the last one leaves.
      const delay = (5.6 * x / width) % interval;
      const phase = ((cycle - delay + interval) % interval) / 1.85;
      if (phase <= 0 || phase >= 1) continue;
      const gust = Math.sin(phase * Math.PI * 2) * Math.sin(phase * Math.PI) ** 2;
      for (const { y, bend } of cells) {
        const sourceX = Math.max(0, Math.min(width - 8, x - gust * bend));
        const rowHeight = Math.min(5, height - y);
        brush.drawImage(picture, sourceX, y, 8, rowHeight, x, y, 8, rowHeight);
      }
    }
  }

  let handle = 0;
  let elapsed = 0;
  let previous = 0;
  let painted = 0;
  let visible = true;
  let loaded = false;
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  });
  observer.observe(cover);
  document.addEventListener('visibilitychange', update);
  motion.addEventListener?.('change', update);

  function update() {
    const active = loaded && visible && !document.hidden && !motion.matches;
    if (!active) {
      cancelAnimationFrame(handle);
      handle = 0;
      previous = 0;
      if (motion.matches) canvas.hidden = true;
      return;
    }
    if (!handle) handle = requestAnimationFrame(draw);
  }
  function draw(now) {
    if (previous) elapsed += Math.min(now - previous, 80);
    previous = now;
    if (now - painted >= 40) {
      brush.drawImage(picture, 0, 0);
      grass(elapsed / 1000);
      canvas.hidden = false;
      painted = now;
    }
    handle = requestAnimationFrame(draw);
  }
  picture.onload = () => { loaded = true; update(); };
  picture.src = canvas.dataset.source;
})();
