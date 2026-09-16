const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
    const indexPath = path.join(__dirname, "public", "index.html");
    fs.readFile(indexPath, "utf8", (err, html) => {
        if (err) return res.status(500).send("Erro ao carregar o jogo.");
        const script = '<script src="/skip-letra.js"></script>';
        res.type("html").send(html.replace("</body>", `${script}</body>`));
    });
});

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const TEMPO_RESPOSTAS = 60;
const TEMPO_MINIMO_STOP = 12;
const TEMPO_VOTACAO = 60;
const TEMPO_RESULTADO = 4;

const categorias = [
    "Nome",
    "Animal",
    "Objeto",
    "Comida",
    "Profissão",
    "CEP",
    "PCH",
    "Filme/Série",
    "Cantor",
    "Marca",
    "Minha sogra é...",
    "Cor"
];

const salas = {};

function gerarCodigoSala() {
    let codigo;
    do {
        codigo = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (salas[codigo]);
    return codigo;
}

function encontrarSalaDoJogador(socketId) {
    for (const codigo in salas) {
        if (salas[codigo].jogadores.some(j => j.id === socketId)) return salas[codigo];
    }
    return null;
}

function encontrarJogador(sala, socketId) {
    return sala.jogadores.find(j => j.id === socketId);
}

function escapeHTML(texto) {
    if (texto === undefined || texto === null) return "";
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function enviarEstadoSala(sala) {
    io.to(sala.codigo).emit("estadoSala", {
        codigo: sala.codigo,
        jogadores: sala.jogadores.map(j => ({ id: j.id, nome: j.nome, pontos: j.pontos })),
        dono: sala.dono
    });
}

function prepararRespostas(sala, zerarPontos = true) {
    sala.jogadores.forEach(jogador => {
        jogador.respostas = {};
        jogador.votos = {};
        jogador.resultados = {};
        if (zerarPontos) jogador.pontosRodada = 0;
        categorias.forEach(categoria => jogador.respostas[categoria] = "");
    });
}

function emitirRodada(sala) {
    sala.fase = "respostas";
    sala.tempo = TEMPO_RESPOSTAS;
    sala.votosPularLetra = {};
    sala.podePararEm = TEMPO_RESPOSTAS - TEMPO_MINIMO_STOP;

    io.to(sala.codigo).emit("rodada", {
        letra: sala.letra,
        categorias,
        votosPular: 0,
        votosNecessarios: Math.ceil(sala.jogadores.length / 2),
        tempoMinimoStop: TEMPO_MINIMO_STOP
    });
    iniciarTimerRespostas(sala);
}

function iniciarRodada(sala) {
    sala.emJogo = true;
    sala.letra = gerarLetra();
    prepararRespostas(sala, true);
    emitirRodada(sala);
    enviarEstadoSala(sala);
}

function pularLetra(sala) {
    if (!sala.emJogo || sala.fase !== "respostas") return;
    clearInterval(sala.timer);
    sala.letra = gerarLetra();
    prepararRespostas(sala, false);
    emitirRodada(sala);
    enviarEstadoSala(sala);
}

function gerarLetra() {
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return letras[Math.floor(Math.random() * letras.length)];
}

function iniciarTimerRespostas(sala) {
    clearInterval(sala.timer);
    sala.timer = setInterval(() => {
        sala.tempo--;
        io.to(sala.codigo).emit("tempo", { tempo: sala.tempo, fase: "respostas" });
        if (sala.tempo <= 0) {
            clearInterval(sala.timer);
            iniciarVotacao(sala);
        }
    }, 1000);
}

function solicitarPularLetra(sala, socketId) {
    if (!sala.emJogo || sala.fase !== "respostas") return;
    if (!encontrarJogador(sala, socketId)) return;
    if (!sala.votosPularLetra) sala.votosPularLetra = {};
    if (sala.votosPularLetra[socketId]) return;

    sala.votosPularLetra[socketId] = true;
    const votos = Object.keys(sala.votosPularLetra).length;
    const necessarios = Math.ceil(sala.jogadores.length / 2);

    io.to(sala.codigo).emit("votoPularLetra", { votos, votosNecessarios: necessarios });

    if (votos >= necessarios) pularLetra(sala);
}

function pararRodada(sala, socketId) {
    if (!sala.emJogo || sala.fase !== "respostas") return;

    if (sala.tempo > TEMPO_RESPOSTAS - TEMPO_MINIMO_STOP) {
        const restantes = sala.tempo - (TEMPO_RESPOSTAS - TEMPO_MINIMO_STOP);
        io.to(socketId).emit(
            "erro",
            `O STOP só pode ser apertado após ${TEMPO_MINIMO_STOP} segundos de rodada. Aguarde mais ${restantes} segundo${restantes === 1 ? "" : "s"}.`
        );
        return;
    }

    clearInterval(sala.timer);
    sala.fase = "votacao";
    io.to(sala.codigo).emit("stop");
    iniciarVotacao(sala);
}

function iniciarVotacao(sala) {
    sala.fase = "votacao";
    sala.categoriaAtual = 0;
    iniciarCategoriaVotacao(sala);
}

function iniciarCategoriaVotacao(sala) {
    if (sala.categoriaAtual >= categorias.length) {
        finalizarRodada(sala);
        return;
    }

    const categoria = categorias[sala.categoriaAtual];
    sala.categoriaVotacao = categoria;
    const respostas = sala.jogadores.map(jogador => ({
        jogadorId: jogador.id,
        jogadorNome: jogador.nome,
        resposta: jogador.respostas[categoria] || "",
        votos: {}
    }));

    sala.respostasVotacao = respostas;
    sala.tempo = TEMPO_VOTACAO;
    io.to(sala.codigo).emit("votacao", {
        categoria,
        respostas: respostas.map(item => ({
            jogadorId: item.jogadorId,
            jogadorNome: escapeHTML(item.jogadorNome),
            resposta: escapeHTML(item.resposta)
        })),
        tempo: TEMPO_VOTACAO
    });
    iniciarTimerVotacao(sala);
}

function iniciarTimerVotacao(sala) {
    clearInterval(sala.timer);
    sala.timer = setInterval(() => {
        sala.tempo--;
        io.to(sala.codigo).emit("tempo", { tempo: sala.tempo, fase: "votacao" });
        if (sala.tempo <= 0) {
            clearInterval(sala.timer);
            finalizarCategoriaVotacao(sala);
        }
    }, 1000);
}

function votar(sala, socketId, jogadorAvaliadoId, voto) {
    if (sala.fase !== "votacao") return;
    const jogador = encontrarJogador(sala, socketId);
    if (!jogador) return;
    if (socketId === jogadorAvaliadoId) {
        io.to(socketId).emit("erro", "Você não pode votar na sua própria resposta.");
        return;
    }

    const resposta = sala.respostasVotacao.find(item => item.jogadorId === jogadorAvaliadoId);
    if (!resposta) return;
    if (resposta.votos[socketId]) {
        io.to(socketId).emit("erro", "Você já votou nessa resposta.");
        return;
    }
    if (voto !== "correta" && voto !== "errada") return;

    resposta.votos[socketId] = voto;
    io.to(socketId).emit("votoRegistrado", { jogadorId: jogadorAvaliadoId, voto });
    verificarTodosVotaram(sala);
}

function verificarTodosVotaram(sala) {
    const quantidadeVotantes = sala.jogadores.length - 1;
    const tudoAvaliado = sala.respostasVotacao.every(resposta =>
        Object.keys(resposta.votos || {}).length >= quantidadeVotantes
    );
    if (tudoAvaliado) {
        clearInterval(sala.timer);
        finalizarCategoriaVotacao(sala);
    }
}

function finalizarCategoriaVotacao(sala) {
    if (sala.fase !== "votacao") return;
    clearInterval(sala.timer);
    const categoria = sala.categoriaVotacao;
    const aprovadas = [];

    sala.respostasVotacao.forEach(resposta => {
        const jogador = encontrarJogador(sala, resposta.jogadorId);
        if (!jogador) return;
        const votos = Object.values(resposta.votos || {});
        const corretos = votos.filter(v => v === "correta").length;
        const errados = votos.filter(v => v === "errada").length;
        let aprovada = corretos > errados;
        if (!resposta.resposta || resposta.resposta.trim() === "") aprovada = false;
        if (aprovada) aprovadas.push({ jogadorId: jogador.id, resposta: resposta.resposta.trim().toLowerCase() });
        jogador.resultados[categoria] = { correta: aprovada, votosCorretos: corretos, votosErrados: errados };
    });

    const quantidadePorResposta = {};
    aprovadas.forEach(item => {
        const normalizada = normalizarResposta(item.resposta);
        quantidadePorResposta[normalizada] = (quantidadePorResposta[normalizada] || 0) + 1;
    });

    sala.jogadores.forEach(jogador => {
        const resultado = jogador.resultados[categoria];
        if (!resultado || !resultado.correta) return;
        const resposta = normalizarResposta(jogador.respostas[categoria]);
        const quantidade = quantidadePorResposta[resposta] || 1;
        const pontos = 10 / quantidade;
        jogador.pontosRodada += pontos;
        jogador.pontos += pontos;
    });

    io.to(sala.codigo).emit("resultadoCategoria", {
        categoria,
        resultados: sala.jogadores.map(jogador => {
            const resultado = jogador.resultados[categoria] || {};
            const resposta = jogador.respostas[categoria] || "";
            const quantidadeIguais = resultado.correta
                ? quantidadePorResposta[normalizarResposta(resposta)] || 1
                : 0;
            return {
                jogadorId: jogador.id,
                jogadorNome: escapeHTML(jogador.nome),
                resposta: escapeHTML(resposta),
                correta: resultado.correta || false,
                votosCorretos: resultado.votosCorretos || 0,
                votosErrados: resultado.votosErrados || 0,
                quantidadeIguais,
                pontosGanhos: resultado.correta ? 10 / quantidadeIguais : 0,
                pontosTotais: jogador.pontos
            };
        })
    });

    enviarEstadoSala(sala);
    sala.categoriaAtual++;
    setTimeout(() => {
        if (sala.emJogo) iniciarCategoriaVotacao(sala);
    }, TEMPO_RESULTADO * 1000);
}

function normalizarResposta(resposta) {
    return String(resposta || "")
        .trim().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

function finalizarRodada(sala) {
    clearInterval(sala.timer);
    sala.fase = "final";
    sala.emJogo = false;
    const ranking = [...sala.jogadores]
        .sort((a, b) => b.pontos - a.pontos)
        .map((jogador, index) => ({ posicao: index + 1, id: jogador.id, nome: jogador.nome, pontos: jogador.pontos }));
    io.to(sala.codigo).emit("resultadoFinal", { ranking });
    enviarEstadoSala(sala);
}

function criarJogador(id, nome) {
    return { id, nome: nome.trim(), pontos: 0, pontosRodada: 0, respostas: {}, votos: {}, resultados: {} };
}

io.on("connection", socket => {
    console.log("Jogador conectado:", socket.id);

    socket.on("criarSala", nome => {
        if (!nome || !nome.trim()) return socket.emit("erro", "Digite seu nome.");
        const codigo = gerarCodigoSala();
        salas[codigo] = {
            codigo, dono: socket.id, jogadores: [], emJogo: false, fase: "aguardando",
            letra: "", categoriaAtual: 0, categoriaVotacao: "", respostasVotacao: [],
            timer: null, tempo: 0, votosPularLetra: {}, podePararEm: 0
        };
        salas[codigo].jogadores.push(criarJogador(socket.id, nome));
        socket.join(codigo);
        socket.emit("salaCriada", { codigo });
        enviarEstadoSala(salas[codigo]);
    });

    socket.on("entrarSala", dados => {
        const nome = dados && dados.nome;
        const codigo = String((dados && dados.codigo) || "").trim().toUpperCase();
        if (!nome || !nome.trim()) return socket.emit("erro", "Digite seu nome.");
        const sala = salas[codigo];
        if (!sala) return socket.emit("erro", "Sala não encontrada.");
        if (sala.emJogo) return socket.emit("erro", "A partida já começou.");
        sala.jogadores.push(criarJogador(socket.id, nome));
        socket.join(codigo);
        socket.emit("entrouSala", { codigo });
        enviarEstadoSala(sala);
    });

    socket.on("iniciar", () => {
        const sala = encontrarSalaDoJogador(socket.id);
        if (!sala) return;
        if (sala.dono !== socket.id) return socket.emit("erro", "Somente o dono da sala pode iniciar.");
        if (sala.jogadores.length < 1) return socket.emit("erro", "Não há jogadores suficientes.");
        if (sala.emJogo) return;
        iniciarRodada(sala);
    });

    socket.on("respostaDigitada", dados => {
        const sala = encontrarSalaDoJogador(socket.id);
        if (!sala || sala.fase !== "respostas") return;
        const jogador = encontrarJogador(sala, socket.id);
        if (!jogador || !categorias.includes(dados && dados.categoria)) return;
        jogador.respostas[dados.categoria] = String((dados && dados.resposta) || "").trim();
    });

    socket.on("respostas", respostas => {
        const sala = encontrarSalaDoJogador(socket.id);
        if (!sala || sala.fase !== "respostas") return;
        const jogador = encontrarJogador(sala, socket.id);
        if (!jogador) return;
        categorias.forEach(categoria => {
            if (respostas && respostas[categoria] !== undefined) jogador.respostas[categoria] = String(respostas[categoria] || "").trim();
        });
    });

    socket.on("stop", () => {
        const sala = encontrarSalaDoJogador(socket.id);
        if (!sala) return;
        pararRodada(sala, socket.id);
    });

    socket.on("pularLetra", () => {
        const sala = encontrarSalaDoJogador(socket.id);
        if (!sala) return;
        solicitarPularLetra(sala, socket.id);
    });

    socket.on("votar", dados => {
        const sala = encontrarSalaDoJogador(socket.id);
        if (!sala) return;
        votar(sala, socket.id, dados.jogadorId, dados.voto);
    });

    socket.on("proxima", () => {
        const sala = encontrarSalaDoJogador(socket.id);
        if (!sala || sala.fase !== "votacao") return;
        clearInterval(sala.timer);
        finalizarCategoriaVotacao(sala);
    });

    socket.on("disconnect", () => {
        const sala = encontrarSalaDoJogador(socket.id);
        if (!sala) return;

        delete sala.votosPularLetra[socket.id];
        sala.jogadores = sala.jogadores.filter(jogador => jogador.id !== socket.id);

        if (sala.dono === socket.id) {
            if (sala.jogadores.length > 0) {
                sala.dono = sala.jogadores[0].id;
                io.to(sala.codigo).emit("novoDono", sala.dono);
            } else {
                clearInterval(sala.timer);
                delete salas[sala.codigo];
                return;
            }
        }

        if (sala.jogadores.length === 0) {
            clearInterval(sala.timer);
            delete salas[sala.codigo];
            return;
        }

        enviarEstadoSala(sala);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
