(() => {
  function setup() {
    const stopArea = document.querySelector('.stop-area');
    if (!stopArea || typeof socket === 'undefined') return;
    if (document.getElementById('pularLetra')) return;

    const style = document.createElement('style');
    style.textContent = `#pularLetra{background:#f59e0b;color:#111827;width:220px;padding:13px 20px;border-radius:8px;font-size:17px;font-weight:bold;cursor:pointer;margin:5px}#pularLetra:disabled{opacity:.45;cursor:not-allowed}`;
    document.head.appendChild(style);

    const button = document.createElement('button');
    button.id = 'pularLetra';
    button.textContent = '⏭️ Pular letra (0/1)';
    stopArea.appendChild(button);

    button.addEventListener('click', () => {
      if (button.disabled) return;
      button.disabled = true;
      socket.emit('pularLetra');
    });

    socket.on('rodada', dados => {
      const n = dados.votosNecessarios || 1;
      button.disabled = false;
      button.textContent = `⏭️ Pular letra (0/${n})`;
    });

    socket.on('votoPularLetra', dados => {
      button.textContent = `⏭️ Pular letra (${dados.votos}/${dados.votosNecessarios})`;
      button.disabled = true;
    });

    socket.on('stop', () => {
      button.disabled = true;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
