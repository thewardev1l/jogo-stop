const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const TEMPO_RESPOSTAS = 60;
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
    "Filme/Série"
];

// ==========================================
// SALAS
// ==========================================

const salas = {};

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function gerarCodigoSala() {
    let codigo;

    do {
        codigo = Math.random()
            .toString(36)
            .substring(2, 6)
            .toUpperCase();
    } while (salas[codigo]);

    return codigo;
}

function encontrarSalaDoJogador(socketId) {
    for (const codigo in salas) {
        const sala = salas[codigo];

        if (sala.jogadores.some(j => j.id === socketId)) {
            return sala;
        }
    }

    return null;
}

function encontrarJogador(sala, socketId) {
    return sala.jogadores.find(j => j.id === socketId);
}

function escapeHTML(texto) {
    if (texto === undefined || texto === null) {
        return "";
    }

    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================
// ESTADO DA SALA
// ==========================================

function enviarEstadoSala(sala) {

    io.to(sala.codigo).emit("estadoSala", {
        codigo: sala.codigo,

        jogadores: sala.jogadores.map(j => ({
            id: j.id,
            nome: j.nome,
            pontos: j.pontos
        })),

        dono: sala.dono
    });
}

// ==========================================
// NOVA RODADA
// ==========================================

function iniciarRodada(sala) {

    sala.emJogo = true;
    sala.fase = "respostas";

    sala.letra = gerarLetra();

    sala.jogadores.forEach(jogador => {

        jogador.respostas = {};
        jogador.votos = {};
        jogador.resultados = {};
        jogador.pontosRodada = 0;

        categorias.forEach(categoria => {
            jogador.respostas[categoria] = "";
        });
    });

    sala.tempo = TEMPO_RESPOSTAS;

    io.to(sala.codigo).emit("rodada", {
        letra: sala.letra,
        categorias: categorias
    });

    enviarEstadoSala(sala);

    iniciarTimerRespostas(sala);
}

// ==========================================
// GERAR LETRA
// ==========================================

function gerarLetra() {

    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    return letras[Math.floor(Math.random() * letras.length)];
}

// ==========================================
// TIMER DAS RESPOSTAS
// ==========================================

function iniciarTimerRespostas(sala) {

    clearInterval(sala.timer);

    sala.timer = setInterval(() => {

        sala.tempo--;

        io.to(sala.codigo).emit("tempo", {
            tempo: sala.tempo,
            fase: "respostas"
        });

        if (sala.tempo <= 0) {

            clearInterval(sala.timer);

            iniciarVotacao(sala);
        }

    }, 1000);
}

// ==========================================
// STOP
// ==========================================

function pararRodada(sala, socketId) {

    if (!sala.emJogo) {
        return;
    }

    if (sala.fase !== "respostas") {
        return;
    }

    clearInterval(sala.timer);

    sala.fase = "votacao";

    io.to(sala.codigo).emit("stop");

    iniciarVotacao(sala);
}

// ==========================================
// VOTAÇÃO
// ==========================================

function iniciarVotacao(sala) {

    sala.fase = "votacao";

    sala.categoriaAtual = 0;

    iniciarCategoriaVotacao(sala);
}

// ==========================================
// INICIAR CATEGORIA DA VOTAÇÃO
// ==========================================

function iniciarCategoriaVotacao(sala) {

    if (sala.categoriaAtual >= categorias.length) {

        finalizarRodada(sala);

        return;
    }

    const categoria = categorias[sala.categoriaAtual];

    sala.categoriaVotacao = categoria;

    sala.jogadores.forEach(jogador => {

        if (!jogador.votos) {
            jogador.votos = {};
        }

        if (!jogador.votos[categoria]) {
            jogador.votos[categoria] = {};
        }
    });

    const respostas = sala.jogadores.map(jogador => {

        return {
            jogadorId: jogador.id,
            jogadorNome: jogador.nome,
            resposta: jogador.respostas[categoria] || "",
            votos: {}
        };
    });

    sala.respostasVotacao = respostas;

    sala.tempo = TEMPO_VOTACAO;

    io.to(sala.codigo).emit("votacao", {

        categoria: categoria,

        respostas: respostas.map(item => ({
            jogadorId: item.jogadorId,
            jogadorNome: escapeHTML(item.jogadorNome),
            resposta: escapeHTML(item.resposta)
        })),

        tempo: TEMPO_VOTACAO
    });

    iniciarTimerVotacao(sala);
}

// ==========================================
// TIMER DA VOTAÇÃO
// ==========================================

function iniciarTimerVotacao(sala) {

    clearInterval(sala.timer);

    sala.timer = setInterval(() => {

        sala.tempo--;

        io.to(sala.codigo).emit("tempo", {
            tempo: sala.tempo,
            fase: "votacao"
        });

        if (sala.tempo <= 0) {

            clearInterval(sala.timer);

            finalizarCategoriaVotacao(sala);
        }

    }, 1000);
}

// ==========================================
// VOTAR
// ==========================================

function votar(sala, socketId, jogadorAvaliadoId, voto) {

    if (sala.fase !== "votacao") {
        return;
    }

    const categoria = sala.categoriaVotacao;

    const jogador = encontrarJogador(sala, socketId);

    if (!jogador) {
        return;
    }

    // ======================================
    // NÃO PODE VOTAR NA PRÓPRIA RESPOSTA
    // ======================================

    if (socketId === jogadorAvaliadoId) {

        io.to(socketId).emit("erro", "Você não pode votar na sua própria resposta.");

        return;
    }

    // ======================================
    // VERIFICAR RESPOSTA
    // ======================================

    const respostaAvaliada = sala.respostasVotacao.find(
        item => item.jogadorId === jogadorAvaliadoId
    );

    if (!respostaAvaliada) {
        return;
    }

    // ======================================
    // EVITAR VOTO DUPLICADO
    // ======================================

    if (!respostaAvaliada.votos) {
        respostaAvaliada.votos = {};
    }

    if (respostaAvaliada.votos[socketId]) {

        io.to(socketId).emit(
            "erro",
            "Você já votou nessa resposta."
        );

        return;
    }

    // ======================================
    // VALIDAR VOTO
    // ======================================

    if (voto !== "correta" && voto !== "errada") {
        return;
    }

    respostaAvaliada.votos[socketId] = voto;

    // ======================================
    // AVISAR O JOGADOR QUE ELE VOTOU
    // ======================================

    io.to(socketId).emit("votoRegistrado", {
        jogadorId: jogadorAvaliadoId,
        voto: voto
    });

    // ======================================
    // ATUALIZAR A SALA
    // ======================================

    verificarTodosVotaram(sala);
}

// ==========================================
// VERIFICAR SE TODOS OS VOTOS POSSÍVEIS
// FORAM FEITOS
// ==========================================

function verificarTodosVotaram(sala) {

    let tudoAvaliado = true;

    for (const resposta of sala.respostasVotacao) {

        const jogadorDaResposta = encontrarJogador(
            sala,
            resposta.jogadorId
        );

        if (!jogadorDaResposta) {
            continue;
        }

        // Quantidade de pessoas que podem votar
        const quantidadeVotantes =
            sala.jogadores.length - 1;

        const quantidadeVotos =
            Object.keys(resposta.votos || {}).length;

        if (quantidadeVotos < quantidadeVotantes) {

            tudoAvaliado = false;

            break;
        }
    }

    if (tudoAvaliado) {

        clearInterval(sala.timer);

        finalizarCategoriaVotacao(sala);
    }
}

// ==========================================
// FINALIZAR VOTAÇÃO DA CATEGORIA
// ==========================================

function finalizarCategoriaVotacao(sala) {

    if (sala.fase !== "votacao") {
        return;
    }

    clearInterval(sala.timer);

    const categoria = sala.categoriaVotacao;

    // ======================================
    // CALCULAR RESULTADOS
    // ======================================

    const aprovadas = [];

    sala.respostasVotacao.forEach(resposta => {

        const jogador = encontrarJogador(
            sala,
            resposta.jogadorId
        );

        if (!jogador) {
            return;
        }

        const votos = Object.values(
            resposta.votos || {}
        );

        const corretos = votos.filter(
            voto => voto === "correta"
        ).length;

        const errados = votos.filter(
            voto => voto === "errada"
        ).length;

        let aprovada = false;

        // Maioria precisa considerar correta
        if (corretos > errados) {
            aprovada = true;
        }

        // ==================================
        // RESPOSTA VAZIA NÃO GANHA PONTOS
        // ==================================

        if (!resposta.resposta || resposta.resposta.trim() === "") {
            aprovada = false;
        }

        if (aprovada) {

            aprovadas.push({
                jogadorId: jogador.id,
                resposta: resposta.resposta.trim().toLowerCase()
            });
        }

        jogador.resultados[categoria] = {
            correta: aprovada,
            votosCorretos: corretos,
            votosErrados: errados
        };
    });

    // ======================================
    // CONTAR RESPOSTAS IGUAIS
    // ======================================

    const quantidadePorResposta = {};

    aprovadas.forEach(item => {

        const respostaNormalizada = normalizarResposta(
            item.resposta
        );

        if (!quantidadePorResposta[respostaNormalizada]) {
            quantidadePorResposta[respostaNormalizada] = 0;
        }

        quantidadePorResposta[respostaNormalizada]++;
    });

    // ======================================
    // DAR PONTOS
    // ======================================

    sala.jogadores.forEach(jogador => {

        const resultado = jogador.resultados[categoria];

        if (!resultado || !resultado.correta) {
            return;
        }

        const resposta = normalizarResposta(
            jogador.respostas[categoria]
        );

        const quantidade =
            quantidadePorResposta[resposta] || 1;

        const pontos = 10 / quantidade;

        jogador.pontosRodada += pontos;
        jogador.pontos += pontos;
    });

    // ======================================
    // ENVIAR RESULTADO
    // ======================================

    io.to(sala.codigo).emit("resultadoCategoria", {

        categoria: categoria,

        resultados: sala.jogadores.map(jogador => {

            const resultado =
                jogador.resultados[categoria] || {};

            const resposta =
                jogador.respostas[categoria] || "";

            let quantidadeIguais = 0;

            if (resultado.correta) {

                quantidadeIguais =
                    quantidadePorResposta[
                        normalizarResposta(resposta)
                    ] || 1;
            }

            const pontosGanhos =
                resultado.correta
                    ? 10 / quantidadeIguais
                    : 0;

            return {

                jogadorId: jogador.id,

                jogadorNome:
                    escapeHTML(jogador.nome),

                resposta:
                    escapeHTML(resposta),

                correta:
                    resultado.correta || false,

                votosCorretos:
                    resultado.votosCorretos || 0,

                votosErrados:
                    resultado.votosErrados || 0,

                quantidadeIguais:
                    quantidadeIguais,

                pontosGanhos:
                    pontosGanhos,

                pontosTotais:
                    jogador.pontos
            };
        })
    });

    enviarEstadoSala(sala);

    // ======================================
    // PRÓXIMA CATEGORIA
    // ======================================

    sala.categoriaAtual++;

    setTimeout(() => {

        if (sala.emJogo) {
            iniciarCategoriaVotacao(sala);
        }

    }, TEMPO_RESULTADO * 1000);
}

// ==========================================
// NORMALIZAR RESPOSTA
// ==========================================

function normalizarResposta(resposta) {

    return String(resposta || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

// ==========================================
// FINALIZAR RODADA
// ==========================================

function finalizarRodada(sala) {

    clearInterval(sala.timer);

    sala.fase = "final";
    sala.emJogo = false;

    const ranking = [...sala.jogadores]
        .sort((a, b) => b.pontos - a.pontos)
        .map((jogador, index) => {

            return {
                posicao: index + 1,
                id: jogador.id,
                nome: jogador.nome,
                pontos: jogador.pontos
            };
        });

    io.to(sala.codigo).emit("resultadoFinal", {
        ranking: ranking
    });

    enviarEstadoSala(sala);
}

// ==========================================
// SOCKET.IO
// ==========================================

io.on("connection", socket => {

    console.log("Jogador conectado:", socket.id);

    // ======================================
    // CRIAR SALA
    // ======================================

    socket.on("criarSala", nome => {

        if (!nome || !nome.trim()) {
            socket.emit("erro", "Digite seu nome.");

            return;
        }

        const codigo = gerarCodigoSala();

        salas[codigo] = {

            codigo: codigo,

            dono: socket.id,

            jogadores: [],

            emJogo: false,

            fase: "aguardando",

            letra: "",

            categoriaAtual: 0,

            categoriaVotacao: "",

            respostasVotacao: [],

            timer: null,

            tempo: 0
        };

        const jogador = {

            id: socket.id,

            nome: nome.trim(),

            pontos: 0,

            pontosRodada: 0,

            respostas: {},

            votos: {},

            resultados: {}
        };

        salas[codigo].jogadores.push(jogador);

        socket.join(codigo);

        socket.emit("salaCriada", {
            codigo: codigo
        });

        enviarEstadoSala(salas[codigo]);
    });

    // ======================================
    // ENTRAR NA SALA
    // ======================================

    socket.on("entrarSala", dados => {

        const nome = dados.nome;
        const codigo = String(dados.codigo || "")
            .trim()
            .toUpperCase();

        if (!nome || !nome.trim()) {

            socket.emit(
                "erro",
                "Digite seu nome."
            );

            return;
        }

        const sala = salas[codigo];

        if (!sala) {

            socket.emit(
                "erro",
                "Sala não encontrada."
            );

            return;
        }

        if (sala.emJogo) {

            socket.emit(
                "erro",
                "A partida já começou."
            );

            return;
        }

        const jogador = {

            id: socket.id,

            nome: nome.trim(),

            pontos: 0,

            pontosRodada: 0,

            respostas: {},

            votos: {},

            resultados: {}
        };

        sala.jogadores.push(jogador);

        socket.join(codigo);

        socket.emit("entrouSala", {
            codigo: codigo
        });

        enviarEstadoSala(sala);
    });

    // ======================================
    // INICIAR
    // ======================================

    socket.on("iniciar", () => {

        const sala =
            encontrarSalaDoJogador(socket.id);

        if (!sala) {
            return;
        }

        if (sala.dono !== socket.id) {

            socket.emit(
                "erro",
                "Somente o dono da sala pode iniciar."
            );

            return;
        }

        if (sala.jogadores.length < 1) {

            socket.emit(
                "erro",
                "Não há jogadores suficientes."
            );

            return;
        }

        if (sala.emJogo) {
            return;
        }

        iniciarRodada(sala);
    });

    // ======================================
    // SALVAR UMA RESPOSTA
    // ======================================

    socket.on("respostaDigitada", dados => {

        const sala =
            encontrarSalaDoJogador(socket.id);

        if (!sala) {
            return;
        }

        if (sala.fase !== "respostas") {
            return;
        }

        const jogador =
            encontrarJogador(sala, socket.id);

        if (!jogador) {
            return;
        }

        const categoria = dados.categoria;
        const resposta = dados.resposta;

        if (!categorias.includes(categoria)) {
            return;
        }

        jogador.respostas[categoria] =
            String(resposta || "").trim();
    });

    // ======================================
    // ENVIAR TODAS AS RESPOSTAS
    // ======================================

    socket.on("respostas", respostas => {

        const sala =
            encontrarSalaDoJogador(socket.id);

        if (!sala) {
            return;
        }

        if (sala.fase !== "respostas") {
            return;
        }

        const jogador =
            encontrarJogador(sala, socket.id);

        if (!jogador) {
            return;
        }

        categorias.forEach(categoria => {

            if (
                respostas &&
                respostas[categoria] !== undefined
            ) {

                jogador.respostas[categoria] =
                    String(
                        respostas[categoria] || ""
                    ).trim();
            }
        });
    });

    // ======================================
    // STOP
    // ======================================

    socket.on("stop", () => {

        const sala =
            encontrarSalaDoJogador(socket.id);

        if (!sala) {
            return;
        }

        pararRodada(sala, socket.id);
    });

    // ======================================
    // VOTAR
    // ======================================

    socket.on("votar", dados => {

        const sala =
            encontrarSalaDoJogador(socket.id);

        if (!sala) {
            return;
        }

        votar(
            sala,
            socket.id,
            dados.jogadorId,
            dados.voto
        );
    });

    // ======================================
    // PRÓXIMA
    // ======================================

    socket.on("proxima", () => {

        const sala =
            encontrarSalaDoJogador(socket.id);

        if (!sala) {
            return;
        }

        if (sala.fase !== "votacao") {
            return;
        }

        clearInterval(sala.timer);

        finalizarCategoriaVotacao(sala);
    });

    // ======================================
    // DESCONECTAR
    // ======================================

    socket.on("disconnect", () => {

        console.log(
            "Jogador desconectado:",
            socket.id
        );

        const sala =
            encontrarSalaDoJogador(socket.id);

        if (!sala) {
            return;
        }

        sala.jogadores =
            sala.jogadores.filter(
                jogador => jogador.id !== socket.id
            );

        // Se era o dono, escolher outro
        if (sala.dono === socket.id) {

            if (sala.jogadores.length > 0) {

                sala.dono =
                    sala.jogadores[0].id;

                io.to(sala.codigo).emit(
                    "novoDono",
                    sala.dono
                );

            } else {

                clearInterval(sala.timer);

                delete salas[sala.codigo];

                return;
            }
        }

        // Se a sala ficou sem jogadores
        if (sala.jogadores.length === 0) {

            clearInterval(sala.timer);

            delete salas[sala.codigo];

            return;
        }

        enviarEstadoSala(sala);
    });
});

// ==========================================
// SERVIDOR
// ==========================================

server.listen(PORT, () => {

    console.log(
        `Servidor rodando na porta ${PORT}`
    );
});
