(() => {
  function setup() {
    const stopArea = document.querySelector('.stop-area');
    if (!stopArea || typeof socket === 'undefined') return;
    if (document.getElementById('pularLetra')) return;

    const style = document.createElement('style');
    style.textContent = `
      :root {
        --bg-1: #070b16;
        --bg-2: #111827;
        --surface: rgba(15, 23, 42, .82);
        --surface-2: rgba(30, 41, 59, .72);
        --border: rgba(148, 163, 184, .16);
        --text: #f8fafc;
        --muted: #94a3b8;
        --accent: #60a5fa;
        --accent-2: #a78bfa;
        --success: #34d399;
        --danger: #fb7185;
        --warning: #fbbf24;
        --shadow: 0 24px 70px rgba(0, 0, 0, .35);
      }

      html { scroll-behavior: smooth; }

      body {
        background:
          radial-gradient(circle at 15% 10%, rgba(96,165,250,.16), transparent 28%),
          radial-gradient(circle at 85% 15%, rgba(167,139,250,.14), transparent 30%),
          linear-gradient(145deg, var(--bg-1), var(--bg-2) 55%, #0b1120);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .container { max-width: 1180px; padding-top: 10px; }

      h1 {
        font-size: clamp(52px, 9vw, 86px);
        letter-spacing: -5px;
        margin: 4px 0 24px;
        background: linear-gradient(135deg, #fff 15%, #93c5fd 50%, #a78bfa 85%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: none;
        filter: drop-shadow(0 12px 30px rgba(96,165,250,.18));
      }

      h2 { font-size: 25px; letter-spacing: -.5px; }

      .card {
        background: linear-gradient(145deg, rgba(30,41,59,.88), rgba(15,23,42,.82));
        border: 1px solid var(--border);
        border-radius: 22px;
        padding: clamp(18px, 3vw, 30px);
        margin-bottom: 20px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      input {
        background: rgba(2, 6, 23, .62);
        color: var(--text);
        border: 1px solid rgba(148,163,184,.18);
        outline: none;
        border-radius: 12px;
        transition: border-color .2s, box-shadow .2s, transform .2s;
      }

      input::placeholder { color: #64748b; }
      input:focus {
        border-color: rgba(96,165,250,.7);
        box-shadow: 0 0 0 4px rgba(96,165,250,.11);
        transform: translateY(-1px);
      }

      hr { border: 0; border-top: 1px solid var(--border); margin: 22px 0; }

      button {
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.08);
        box-shadow: 0 8px 20px rgba(0,0,0,.18);
        transition: transform .18s ease, filter .18s ease, box-shadow .18s ease;
      }

      button:hover:not(:disabled) {
        transform: translateY(-2px);
        filter: brightness(1.08);
        box-shadow: 0 12px 28px rgba(0,0,0,.25);
      }

      .btn-primary { background: linear-gradient(135deg, #2563eb, #4f46e5); }
      .btn-success { background: linear-gradient(135deg, #059669, #16a34a); }
      .btn-danger, .btn-wrong { background: linear-gradient(135deg, #e11d48, #dc2626); }
      .btn-correct { background: linear-gradient(135deg, #059669, #10b981); }

      .room-code {
        display: inline-block;
        position: relative;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 24px;
        border-radius: 14px;
        background: rgba(251,191,36,.08);
        border: 1px solid rgba(251,191,36,.2);
        color: #fde68a;
        font-size: 32px;
        letter-spacing: 7px;
        text-shadow: 0 0 25px rgba(251,191,36,.2);
      }

      .players { gap: 14px; }
      .player {
        background: rgba(51,65,85,.48);
        border: 1px solid var(--border);
        border-radius: 15px;
        padding: 16px;
        transition: transform .2s, border-color .2s;
      }
      .player:hover { transform: translateY(-2px); border-color: rgba(96,165,250,.28); }
      .score { color: #fde68a; }

      .letter {
        width: 125px;
        height: 125px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 10px auto 2px;
        border-radius: 30px;
        background: linear-gradient(145deg, rgba(96,165,250,.16), rgba(167,139,250,.12));
        border: 1px solid rgba(147,197,253,.22);
        color: #f8fafc;
        font-size: 76px;
        line-height: 1;
        box-shadow: inset 0 1px rgba(255,255,255,.08), 0 18px 50px rgba(59,130,246,.12);
        animation: letterIn .35s ease;
      }

      .timer {
        font-variant-numeric: tabular-nums;
        color: #7dd3fc;
        font-size: 38px;
        margin: 12px 0 18px;
        text-shadow: 0 0 24px rgba(56,189,248,.22);
      }

      .message {
        color: var(--muted);
        font-size: 16px;
        margin: 12px 0 20px;
      }

      .categories { gap: 12px; }
      .category {
        background: rgba(51,65,85,.42);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 16px;
        transition: border-color .2s, background .2s, transform .2s;
      }
      .category:focus-within {
        background: rgba(51,65,85,.58);
        border-color: rgba(96,165,250,.35);
        transform: translateY(-1px);
      }
      .category label { color: #bfdbfe; font-size: 17px; }
      .category input { margin-bottom: 0; }

      .stop-area {
        margin-top: 28px;
        padding-top: 22px;
        border-top: 1px solid var(--border);
      }

      .stop-button {
        width: 180px;
        height: 180px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 25%, #fb7185, #e11d48 45%, #9f1239 100%);
        border: 7px solid rgba(255,255,255,.08);
        color: white;
        font-size: 29px;
        letter-spacing: 1px;
        box-shadow: 0 0 0 10px rgba(225,29,72,.06), 0 20px 55px rgba(225,29,72,.28), inset 0 2px 0 rgba(255,255,255,.2);
      }
      .stop-button:hover:not(:disabled) {
        transform: scale(1.04) translateY(-2px);
        filter: brightness(1.08);
      }

      #pularLetra {
        display: block;
        width: min(260px, 90%);
        margin: 16px auto 0;
        background: linear-gradient(135deg, #d97706, #f59e0b);
        color: #1c1917;
        border: 0;
      }

      .voting-title { color: #c4b5fd; font-size: 31px; }
      .answer-card, .result-card {
        background: rgba(51,65,85,.46);
        border: 1px solid var(--border);
        border-radius: 16px;
      }
      .answer-card h3 { color: #93c5fd; }
      .answer-text { background: rgba(2,6,23,.55); border: 1px solid rgba(148,163,184,.1); }
      .vote-status { background: rgba(71,85,105,.55); }

      .rank-item {
        background: rgba(51,65,85,.5);
        border: 1px solid var(--border);
        border-radius: 16px;
      }
      .rank-1 {
        background: linear-gradient(135deg, rgba(180,83,9,.65), rgba(120,53,15,.7));
        border-color: rgba(251,191,36,.28);
      }

      .small { color: #64748b; }

      @keyframes letterIn {
        from { opacity: 0; transform: scale(.82) rotate(-4deg); }
        to { opacity: 1; transform: scale(1) rotate(0); }
      }

      @media (max-width: 600px) {
        body { padding: 12px; }
        h1 { margin-bottom: 18px; }
        .card { border-radius: 18px; }
        .letter { width: 105px; height: 105px; font-size: 62px; border-radius: 25px; }
        .stop-button { width: 155px; height: 155px; font-size: 25px; }
        .categories { grid-template-columns: 1fr; }
        .vote-buttons button { flex: 1; min-width: 130px; }
      }
    `;
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
