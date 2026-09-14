const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const categorias = [
    "Nome",
    "Animal",
    "Objeto",
    "Comida"
];

const letras = "ABCDEFGHIJKLMNOPQRSTUV";

const salas = {};

function gerarCodigo() {
    let codigo;

    do {
        codigo = Math.random()
            .toString(36)
            .substring(2, 6)
            .toUpperCase();
    } while (salas[codigo]);

    return codigo;
}

function sortearLetra() {
    return letras[
        Math.floor(Math.random() * letras.length)
    ];
}

function enviarEstado(codigo) {
    const sala = salas[codigo];

    if (!sala) return;

    io.to(codigo).emit("estadoSala", {
        jogadores: sala.jogadores.map(j => ({
            id: j.id,
            nome: j.nome,
            pontos: j.pontos
        })),

        iniciada: sala.iniciada,
        fase: sala.fase
    });
}


// ======================================================
// INICIAR VOTAÇÃO
// ======================================================

function enviarCategoriaParaVotacao(codigo) {

    const sala = salas[codigo];

    if (!sala) return;

    if (sala.indiceCategoria >= categorias.length) {

        finalizarRodada(codigo);

        return;
    }

    const categoria =
        categorias[sala.indiceCategoria];

    sala.fase = "votacao";

    sala.categoriaAtual = categoria;

    // IMPORTANTE:
    // Todos os jogadores são enviados,
    // independentemente de quem apertou STOP.

    const respostas =
        sala.jogadores.map(jogador => ({

            jogadorId: jogador.id,

            nome: jogador.nome,

            resposta:
                jogador.respostas[categoria] || ""

        }));


    // Limpa os votos da categoria atual

    sala.jogadores.forEach(jogador => {

        jogador.votos = {};

    });


    io.to(codigo).emit("votacao", {

        categoria,

        numeroCategoria:
            sala.indiceCategoria + 1,

        totalCategorias:
            categorias.length,

        respostas

    });
}


// ======================================================
// ENCERRAR VOTAÇÃO
// ======================================================

function encerrarVotacao(codigo) {

    const sala = salas[codigo];

    if (!sala) return;

    if (sala.fase !== "votacao") return;

    const categoria =
        sala.categoriaAtual;


    sala.jogadores.forEach(jogadorResposta => {

        const votos =
            jogadorResposta.votos || {};

        let corretos = 0;
        let errados = 0;


        Object.values(votos).forEach(voto => {

            if (voto === "correta") {
                corretos++;
            }

            if (voto === "errada") {
                errados++;
            }

        });


        let resultado = "empate";


        if (corretos > errados) {

            resultado = "correta";

            jogadorResposta.pontos += 10;

            jogadorResposta.pontosRodada =
                (jogadorResposta.pontosRodada || 0) + 10;
        }


        if (errados > corretos) {

            resultado = "errada";

        }


        jogadorResposta.resultados =
            jogadorResposta.resultados || {};


        jogadorResposta.resultados[categoria] = {

            corretos,

            errados,

            resultado,

            resposta:
                jogadorResposta.respostas[categoria] || ""

        };

    });


    const resultados =
        sala.jogadores.map(jogador => ({

            jogadorId: jogador.id,

            nome: jogador.nome,

            resposta:
                jogador.respostas[categoria] || "",

            resultado:
                jogador.resultados[categoria]

        }));


    io.to(codigo).emit(
        "resultadoVotacao",
        {
            categoria,
            resultados
        }
    );


    // Espera 4 segundos e passa para a próxima categoria

    setTimeout(() => {

        if (!salas[codigo]) return;

        sala.indiceCategoria++;


        if (
            sala.indiceCategoria >=
            categorias.length
        ) {

            finalizarRodada(codigo);

        } else {

            enviarCategoriaParaVotacao(codigo);

        }

    }, 4000);
}


// ======================================================
// RESULTADO FINAL
// ======================================================

function finalizarRodada(codigo) {

    const sala = salas[codigo];

    if (!sala) return;

    sala.fase = "resultado";


    const resultado =
        sala.jogadores.map(jogador => ({

            nome: jogador.nome,

            pontosRodada:
                jogador.pontosRodada || 0,

            pontos:
                jogador.pontos

        }));


    io.to(codigo).emit(
        "resultado",
        resultado
    );

    enviarEstado(codigo);
}


// ======================================================
// SOCKET.IO
// ======================================================

io.on("connection", socket => {

    console.log(
        "Jogador conectado:",
        socket.id
    );


    // ==================================================
    // CRIAR SALA
    // ==================================================

    socket.on("criarSala", nome => {

        nome =
            String(nome || "").trim();


        if (!nome) {

            socket.emit(
                "erro",
                "Digite seu nome."
            );

            return;
        }


        const codigo =
            gerarCodigo();


        salas[codigo] = {

            dono: socket.id,

            jogadores: [

                {

                    id: socket.id,

                    nome,

                    pontos: 0,

                    pontosRodada: 0,

                    respostas: {},

                    votos: {},

                    resultados: {}

                }

            ],

            iniciada: false,

            fase: "esperando",

            letra: null,

            tempo: 60,

            timer: null,

            indiceCategoria: 0,

            categoriaAtual: null,

            stopPor: null

        };


        socket.join(codigo);

        socket.sala = codigo;


        socket.emit(
            "salaCriada",
            codigo
        );


        enviarEstado(codigo);

    });


    // ==================================================
    // ENTRAR NA SALA
    // ==================================================

    socket.on("entrarSala", dados => {

        const nome =
            String(dados?.nome || "").trim();


        const codigo =
            String(dados?.codigo || "")
            .trim()
            .toUpperCase();


        if (!nome) {

            socket.emit(
                "erro",
                "Digite seu nome."
            );

            return;
        }


        if (!salas[codigo]) {

            socket.emit(
                "erro",
                "Sala não encontrada."
            );

            return;
        }


        const sala =
            salas[codigo];


        if (sala.iniciada) {

            socket.emit(
                "erro",
                "Essa rodada já começou."
            );

            return;
        }


        if (
            sala.jogadores.some(
                j =>
                    j.nome.toLowerCase() ===
                    nome.toLowerCase()
            )
        ) {

            socket.emit(
                "erro",
                "Já existe um jogador com esse nome."
            );

            return;
        }


        sala.jogadores.push({

            id: socket.id,

            nome,

            pontos: 0,

            pontosRodada: 0,

            respostas: {},

            votos: {},

            resultados: {}

        });


        socket.join(codigo);

        socket.sala = codigo;


        socket.emit(
            "entrouSala",
            codigo
        );


        enviarEstado(codigo);

    });


    // ==================================================
    // INICIAR RODADA
    // ==================================================

    socket.on("iniciar", () => {

        const codigo =
            socket.sala;

        const sala =
            salas[codigo];


        if (!sala) return;


        if (sala.dono !== socket.id) {

            socket.emit(
                "erro",
                "Somente o dono da sala pode iniciar."
            );

            return;
        }


        if (sala.iniciada) return;


        sala.iniciada = true;

        sala.fase = "respondendo";

        sala.letra =
            sortearLetra();

        sala.tempo = 60;

        sala.stopPor = null;

        sala.indiceCategoria = 0;

        sala.categoriaAtual = null;


        sala.jogadores.forEach(jogador => {

            jogador.pontosRodada = 0;

            jogador.respostas = {};

            jogador.votos = {};

            jogador.resultados = {};

        });


        io.to(codigo).emit(
            "rodada",
            {

                letra: sala.letra,

                tempo: sala.tempo,

                categorias

            }
        );


        enviarEstado(codigo);


        clearInterval(sala.timer);


        sala.timer = setInterval(() => {

            sala.tempo--;


            io.to(codigo).emit(
                "tempo",
                sala.tempo
            );


            if (sala.tempo <= 0) {

                clearInterval(
                    sala.timer
                );


                sala.fase = "votacao";

                sala.indiceCategoria = 0;


                io.to(codigo).emit(
                    "tempoAcabou"
                );


                enviarCategoriaParaVotacao(
                    codigo
                );

            }

        }, 1000);

    });


    // ==================================================
    // SALVAR RESPOSTAS
    // ==================================================

    socket.on("respostas", respostas => {

        const codigo =
            socket.sala;

        const sala =
            salas[codigo];


        if (!sala) return;


        if (sala.fase !== "respondendo") {
            return;
        }


        const jogador =
            sala.jogadores.find(
                j => j.id === socket.id
            );


        if (!jogador) return;


        // Salva TODAS as categorias recebidas

        categorias.forEach(categoria => {

            if (
                respostas &&
                typeof respostas[categoria] ===
                "string"
            ) {

                jogador.respostas[categoria] =
                    respostas[categoria].trim();

            }

        });

    });


    // ==================================================
    // STOP
    // ==================================================

    socket.on("stop", () => {

        const codigo =
            socket.sala;

        const sala =
            salas[codigo];


        if (!sala) return;


        if (sala.fase !== "respondendo") {
            return;
        }


        // Somente o primeiro STOP vale

        if (sala.stopPor) {
            return;
        }


        sala.stopPor =
            socket.id;


        clearInterval(
            sala.timer
        );


        sala.fase =
            "votacao";


        sala.indiceCategoria =
            0;


        io.to(codigo).emit(
            "stop",
            {
                jogadorId:
                    socket.id
            }
        );


        setTimeout(() => {

            if (!salas[codigo]) return;


            enviarCategoriaParaVotacao(
                codigo
            );

        }, 1000);

    });


    // ==================================================
    // VOTAR
    // ==================================================

    socket.on("votar", dados => {

        const codigo =
            socket.sala;

        const sala =
            salas[codigo];


        if (!sala) return;


        if (sala.fase !== "votacao") {
            return;
        }


        const jogadorQueVota =
            sala.jogadores.find(
                j => j.id === socket.id
            );


        if (!jogadorQueVota) return;


        const jogadorAvaliado =
            sala.jogadores.find(
                j => j.id === dados.jogadorId
            );


        if (!jogadorAvaliado) return;


        // ==============================================
        // NÃO PODE VOTAR NA PRÓPRIA RESPOSTA
        // ==============================================

        if (
            jogadorAvaliado.id ===
            socket.id
        ) {

            socket.emit(
                "erro",
                "Você não pode votar na própria resposta."
            );

            return;
        }


        if (
            dados.voto !== "correta" &&
            dados.voto !== "errada"
        ) {

            return;
        }


        // Impede troca de voto

        if (
            jogadorAvaliado.votos &&
            jogadorAvaliado.votos[socket.id]
        ) {

            return;
        }


        jogadorAvaliado.votos =
            jogadorAvaliado.votos || {};


        jogadorAvaliado.votos[
            socket.id
        ] = dados.voto;


        // ==============================================
        // VERIFICA SE TODOS VOTARAM
        // ==============================================

        let todosVotaram = true;


        for (
            const resposta of sala.jogadores
        ) {

            // O próprio jogador não precisa votar

            for (
                const votante of sala.jogadores
            ) {

                if (
                    resposta.id ===
                    votante.id
                ) {

                    continue;

                }


                if (
                    !resposta.votos[
                        votante.id
                    ]
                ) {

                    todosVotaram = false;

                    break;

                }

            }


            if (!todosVotaram) {
                break;
            }

        }


        if (todosVotaram) {

            encerrarVotacao(
                codigo
            );

        }

    });


    // ==================================================
    // PRÓXIMA RODADA
    // ==================================================

    socket.on("proxima", () => {

        const codigo =
            socket.sala;

        const sala =
            salas[codigo];


        if (!sala) return;


        if (sala.dono !== socket.id) {

            socket.emit(
                "erro",
                "Somente o dono pode iniciar a próxima rodada."
            );

            return;
        }


        if (sala.fase !== "resultado") {
            return;
        }


        sala.iniciada = false;

        sala.fase = "esperando";

        sala.letra = null;

        sala.tempo = 60;

        sala.stopPor = null;

        sala.indiceCategoria = 0;

        sala.categoriaAtual = null;


        sala.jogadores.forEach(jogador => {

            jogador.respostas = {};

            jogador.votos = {};

            jogador.resultados = {};

            jogador.pontosRodada = 0;

        });


        enviarEstado(codigo);


        io.to(codigo).emit(
            "aguardando"
        );

    });


    // ==================================================
    // DESCONECTAR
    // ==================================================

    socket.on("disconnect", () => {

        console.log(
            "Jogador desconectado:",
            socket.id
        );


        const codigo =
            socket.sala;


        if (
            !codigo ||
            !salas[codigo]
        ) {

            return;
        }


        const sala =
            salas[codigo];


        sala.jogadores =
            sala.jogadores.filter(
                j => j.id !== socket.id
            );


        if (sala.dono === socket.id) {

            if (
                sala.jogadores.length > 0
            ) {

                sala.dono =
                    sala.jogadores[0].id;


                io.to(codigo).emit(
                    "novoDono",
                    sala.dono
                );

            } else {

                clearInterval(
                    sala.timer
                );


                delete salas[codigo];

                return;
            }

        }


        enviarEstado(codigo);

    });

});


server.listen(PORT, () => {

    console.log(
        `Servidor rodando na porta ${PORT}`
    );

});
