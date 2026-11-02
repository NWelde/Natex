// Injected into the recorded page (top frame only, via page.evaluate): a visible
// cursor that glides between targets and a ripple on clicks. Headless capture
// has no mouse pointer, and a teleporting one reads as fake.
// Uses only CSSOM + the Web Animations API, so strict site CSPs don't block it.

(() => {
  if (window.__natexDemo) return;
  const root = document.createElement('div');
  Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });

  const cursor = document.createElement('div');
  cursor.innerHTML = `<svg width="22" height="28" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 2 L2 22 L7.5 17 L11 25.5 L14.5 24 L11 15.8 L18.5 15.8 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  Object.assign(cursor.style, { position: 'absolute', left: '0', top: '0', width: '22px', height: '28px',
    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))', transform: 'translate(-40px,-40px)', opacity: '0' });
  root.appendChild(cursor);
  document.documentElement.appendChild(root);

  let x = -40, y = -40;
  const place = () => { cursor.style.transform = `translate(${x - 2}px, ${y - 2}px)`; };

  window.__natexDemo = {
    show(px, py) { x = px; y = py; place(); cursor.style.opacity = '1'; },
    hide() { cursor.style.opacity = '0'; },
    /** Glides to (px, py); resolves when the move ends. */
    move(px, py, ms) {
      cursor.style.opacity = '1';
      const from = `translate(${x - 2}px, ${y - 2}px)`;
      x = px; y = py;
      const to = `translate(${x - 2}px, ${y - 2}px)`;
      const anim = cursor.animate([{ transform: from }, { transform: to }], { duration: ms, easing: 'cubic-bezier(.45,.05,.25,1)' });
      place();
      return anim.finished.then(() => true);
    },
    ripple() {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'absolute', left: `${x - 16}px`, top: `${y - 16}px`, width: '32px', height: '32px',
        borderRadius: '50%', background: 'rgba(79,112,247,.35)', border: '2px solid rgba(79,112,247,.9)' });
      root.insertBefore(r, cursor);
      r.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 450, easing: 'ease-out' })
        .finished.then(() => r.remove());
    },
  };
})();
