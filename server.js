const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));


// =====================================================
// CONFIGURAÇÕES
// =====================================================

const categorias = [
    "Nome",
    "Animal",
    "Objeto",
    "Comida"
];

const letras =
    "ABCDEFGHIJKLMNOPQRSTUV";

const TEMPO_RESPOSTAS = 60;
const TEMPO_VOTACAO = 60;

const salas = {};


// =====================================================
// FUNÇÕES
// =====================================================

function gerarCodigo() {

    let codigo;

    do {

        codigo =
            Math.random()
            .toString(36)
            .substring(2, 6)
            .toUpperCase();

    } while (salas[codigo]);

    return codigo;
}


function sortearLetra() {

    return letras[
        Math.floor(
            Math.random() * letras.length
        )
    ];

}


// =====================================================
// ESTADO DA SALA
// =====================================================

function enviarEstado(codigo) {

    const sala = salas[codigo];

    if (!sala) return;

    io.to(codigo).emit(
        "estadoSala",
        {
            jogadores:
                sala.jogadores.map(j => ({
                    id: j.id,
                    nome: j.nome,
                    pontos: j.pontos
                })),

            iniciada: sala.iniciada,

            fase: sala.fase
        }
    );
}


// =====================================================
// COMEÇAR UMA CATEGORIA DE VOTAÇÃO
// =====================================================

function iniciarVotacao(codigo) {

    const sala = salas[codigo];

    if (!sala) return;


    // Todas as categorias já foram votadas

    if (
        sala.indiceCategoria >=
        categorias.length
    ) {

        finalizarRodada(codigo);

        return;
    }


    const categoria =
        categorias[sala.indiceCategoria];


    sala.fase = "votacao";

    sala.categoriaAtual =
        categoria;

    sala.tempoVotacao =
        TEMPO_VOTACAO;


    // Limpa os votos desta categoria

    sala.jogadores.forEach(jogador => {

        jogador.votos = {};

    });


    // ===============================================
    // PEGA A RESPOSTA DE CADA JOGADOR
    // ===============================================

    const respostas =
        sala.jogadores.map(jogador => ({

            jogadorId:
                jogador.id,

            nome:
                jogador.nome,

            resposta:
                jogador.respostas[categoria] || ""

        }));


    // ===============================================
    // MANDA TODAS AS RESPOSTAS PARA TODOS
    // ===============================================

    io.to(codigo).emit(
        "votacao",
        {

            categoria,

            numeroCategoria:
                sala.indiceCategoria + 1,

            totalCategorias:
                categorias.length,

            respostas,

            tempo:
                TEMPO_VOTACAO

        }
    );


    // ===============================================
    // CRIA O TIMER DA VOTAÇÃO
    // ===============================================

    clearInterval(
        sala.timerVotacao
    );


    sala.timerVotacao =
        setInterval(() => {

            if (!salas[codigo]) {

                clearInterval(
                    sala.timerVotacao
                );

                return;
            }


            sala.tempoVotacao--;


            io.to(codigo).emit(
                "tempoVotacao",
                sala.tempoVotacao
            );


            // Acabou o minuto

            if (
                sala.tempoVotacao <= 0
            ) {

                clearInterval(
                    sala.timerVotacao
                );

                encerrarVotacao(
                    codigo
                );

            }

        }, 1000);

}


// =====================================================
// VERIFICAR SE TODOS JÁ VOTARAM
// =====================================================

function todosVotaram(codigo) {

    const sala = salas[codigo];

    if (!sala) return false;


    for (
        const resposta of sala.jogadores
    ) {

        // Se a pessoa não respondeu,
        // não precisa votar nela.

        const texto =
            resposta.respostas[
                sala.categoriaAtual
            ] || "";


        if (!texto.trim()) {

            continue;

        }


        // Todos os outros jogadores
        // precisam votar nessa resposta

        for (
            const votante of sala.jogadores
        ) {

            // Não vota na própria resposta

            if (
                votante.id ===
                resposta.id
            ) {

                continue;

            }


            if (
                !resposta.votos[
                    votante.id
                ]
            ) {

                return false;

            }

        }

    }


    return true;
}


// =====================================================
// ENCERRAR VOTAÇÃO
// =====================================================

function encerrarVotacao(codigo) {

    const sala = salas[codigo];

    if (!sala) return;


    if (
        sala.fase !== "votacao"
    ) {

        return;

    }


    clearInterval(
        sala.timerVotacao
    );


    const categoria =
        sala.categoriaAtual;


    // ===============================================
    // CALCULA OS VOTOS
    // ===============================================

    sala.jogadores.forEach(
        jogadorResposta => {

            const resposta =
                jogadorResposta
                .respostas[categoria] || "";


            let corretos = 0;

            let errados = 0;


            Object.values(
                jogadorResposta.votos || {}
            ).forEach(voto => {

                if (
                    voto === "correta"
                ) {

                    corretos++;

                }

                if (
                    voto === "errada"
                ) {

                    errados++;

                }

            });


            let resultado =
                "empate";


            // Maioria aprovou

            if (
                corretos > errados
            ) {

                resultado =
                    "correta";


                jogadorResposta.pontos += 10;


                jogadorResposta.pontosRodada =
                    (
                        jogadorResposta
                        .pontosRodada || 0
                    ) + 10;

            }


            // Maioria rejeitou

            else if (
                errados > corretos
            ) {

                resultado =
                    "errada";

            }


            jogadorResposta.resultados =
                jogadorResposta.resultados || {};


            jogadorResposta.resultados[
                categoria
            ] = {

                resposta,

                corretos,

                errados,

                resultado

            };

        }
    );


    // ===============================================
    // MANDA RESULTADO DA CATEGORIA
    // ===============================================

    const resultados =
        sala.jogadores.map(
            jogador => ({

                jogadorId:
                    jogador.id,

                nome:
                    jogador.nome,

                resposta:
                    jogador.respostas[
                        categoria
                    ] || "",

                resultado:
                    jogador.resultados[
                        categoria
                    ]

            })
        );


    io.to(codigo).emit(
        "resultadoVotacao",
        {

            categoria,

            resultados

        }
    );


    // ===============================================
    // PRÓXIMA CATEGORIA
    // ===============================================

    setTimeout(() => {

        if (!salas[codigo])
            return;


        sala.indiceCategoria++;


        if (
            sala.indiceCategoria >=
            categorias.length
        ) {

            finalizarRodada(
                codigo
            );

        }

        else {

            iniciarVotacao(
                codigo
            );

        }

    }, 4000);

}


// =====================================================
// RESULTADO FINAL
// =====================================================

function finalizarRodada(codigo) {

    const sala = salas[codigo];

    if (!sala) return;


    clearInterval(
        sala.timer
    );

    clearInterval(
        sala.timerVotacao
    );


    sala.fase =
        "resultado";


    const resultado =
        sala.jogadores.map(
            jogador => ({

                nome:
                    jogador.nome,

                pontosRodada:
                    jogador.pontosRodada || 0,

                pontos:
                    jogador.pontos

            })
        );


    io.to(codigo).emit(
        "resultado",
        resultado
    );


    enviarEstado(codigo);

}


// =====================================================
// SOCKET.IO
// =====================================================

io.on(
    "connection",
    socket => {

        console.log(
            "Jogador conectado:",
            socket.id
        );


        // =============================================
        // CRIAR SALA
        // =============================================

        socket.on(
            "criarSala",
            nome => {

                nome =
                    String(
                        nome || ""
                    ).trim();


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

                    dono:
                        socket.id,

                    jogadores: [

                        {

                            id:
                                socket.id,

                            nome,

                            pontos: 0,

                            pontosRodada: 0,

                            respostas: {},

                            votos: {},

                            resultados: {}

                        }

                    ],


                    iniciada:
                        false,

                    fase:
                        "esperando",

                    letra:
                        null,

                    tempo:
                        TEMPO_RESPOSTAS,

                    timer:
                        null,

                    timerVotacao:
                        null,

                    tempoVotacao:
                        TEMPO_VOTACAO,

                    indiceCategoria:
                        0,

                    categoriaAtual:
                        null,

                    stopPor:
                        null

                };


                socket.join(codigo);

                socket.sala =
                    codigo;


                socket.emit(
                    "salaCriada",
                    codigo
                );


                enviarEstado(
                    codigo
                );

            }
        );


        // =============================================
        // ENTRAR NA SALA
        // =============================================

        socket.on(
            "entrarSala",
            dados => {

                const nome =
                    String(
                        dados?.nome || ""
                    ).trim();


                const codigo =
                    String(
                        dados?.codigo || ""
                    )
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
                            j.nome
                            .toLowerCase() ===
                            nome.toLowerCase()
                    )
                ) {

                    socket.emit(
                        "erro",
                        "Esse nome já está sendo usado."
                    );

                    return;
                }


                sala.jogadores.push({

                    id:
                        socket.id,

                    nome,

                    pontos: 0,

                    pontosRodada: 0,

                    respostas: {},

                    votos: {},

                    resultados: {}

                });


                socket.join(codigo);

                socket.sala =
                    codigo;


                socket.emit(
                    "entrouSala",
                    codigo
                );


                enviarEstado(
                    codigo
                );

            }
        );


        // =============================================
        // INICIAR RODADA
        // =============================================

        socket.on(
            "iniciar",
            () => {

                const codigo =
                    socket.sala;

                const sala =
                    salas[codigo];


                if (!sala) return;


                if (
                    sala.dono !==
                    socket.id
                ) {

                    socket.emit(
                        "erro",
                        "Somente o dono pode iniciar."
                    );

                    return;
                }


                if (
                    sala.iniciada
                ) {

                    return;

                }


                sala.iniciada =
                    true;

                sala.fase =
                    "respondendo";


                sala.letra =
                    sortearLetra();


                sala.tempo =
                    TEMPO_RESPOSTAS;


                sala.stopPor =
                    null;


                sala.indiceCategoria =
                    0;


                sala.categoriaAtual =
                    null;


                sala.jogadores.forEach(
                    jogador => {

                        jogador.pontosRodada =
                            0;

                        jogador.respostas =
                            {};

                        jogador.votos =
                            {};

                        jogador.resultados =
                            {};

                    }
                );


                io.to(codigo).emit(
                    "rodada",
                    {

                        letra:
                            sala.letra,

                        tempo:
                            TEMPO_RESPOSTAS,

                        categorias

                    }
                );


                enviarEstado(
                    codigo
                );


                clearInterval(
                    sala.timer
                );


                sala.timer =
                    setInterval(() => {

                        sala.tempo--;


                        io.to(codigo).emit(
                            "tempo",
                            sala.tempo
                        );


                        if (
                            sala.tempo <= 0
                        ) {

                            clearInterval(
                                sala.timer
                            );


                            sala.fase =
                                "votacao";


                            sala.indiceCategoria =
                                0;


                            io.to(codigo).emit(
                                "tempoAcabou"
                            );


                            iniciarVotacao(
                                codigo
                            );

                        }

                    }, 1000);

            }
        );


        // =============================================
        // SALVAR UMA RESPOSTA INDIVIDUAL
        // =============================================

        socket.on(
            "respostaDigitada",
            dados => {

                const codigo =
                    socket.sala;

                const sala =
                    salas[codigo];


                if (!sala)
                    return;


                if (
                    sala.fase !==
                    "respondendo"
                ) {

                    return;

                }


                const jogador =
                    sala.jogadores.find(
                        j =>
                            j.id ===
                            socket.id
                    );


                if (!jogador)
                    return;


                const categoria =
                    dados?.categoria;


                const resposta =
                    String(
                        dados?.resposta || ""
                    ).trim();


                // Só aceita categorias existentes

                if (
                    !categorias.includes(
                        categoria
                    )
                ) {

                    return;

                }


                // Salva individualmente

                jogador.respostas[
                    categoria
                ] = resposta;

            }
        );


        // =============================================
        // SALVAR TODAS AS RESPOSTAS
        // =============================================

        socket.on(
            "respostas",
            respostas => {

                const codigo =
                    socket.sala;

                const sala =
                    salas[codigo];


                if (!sala)
                    return;


                if (
                    sala.fase !==
                    "respondendo"
                ) {

                    return;

                }


                const jogador =
                    sala.jogadores.find(
                        j =>
                            j.id ===
                            socket.id
                    );


                if (!jogador)
                    return;


                categorias.forEach(
                    categoria => {

                        if (
                            respostas &&
                            typeof
                            respostas[
                                categoria
                            ] ===
                            "string"
                        ) {

                            jogador.respostas[
                                categoria
                            ] =
                                respostas[
                                    categoria
                                ].trim();

                        }

                    }
                );

            }
        );


        // =============================================
        // STOP
        // =============================================

        socket.on(
            "stop",
            () => {

                const codigo =
                    socket.sala;

                const sala =
                    salas[codigo];


                if (!sala)
                    return;


                if (
                    sala.fase !==
                    "respondendo"
                ) {

                    return;

                }


                // Primeiro STOP

                if (
                    sala.stopPor
                ) {

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

                    if (
                        !salas[codigo]
                    )
                        return;


                    iniciarVotacao(
                        codigo
                    );

                }, 1000);

            }
        );


        // =============================================
        // VOTAR
        // =============================================

        socket.on(
            "votar",
            dados => {

                const codigo =
                    socket.sala;

                const sala =
                    salas[codigo];


                if (!sala)
                    return;


                if (
                    sala.fase !==
                    "votacao"
                ) {

                    return;

                }


                const votante =
                    sala.jogadores.find(
                        j =>
                            j.id ===
                            socket.id
                    );


                if (!votante)
                    return;


                const avaliado =
                    sala.jogadores.find(
                        j =>
                            j.id ===
                            dados?.jogadorId
                    );


                if (!avaliado)
                    return;


                // ========================================
                // NÃO PODE VOTAR NA PRÓPRIA RESPOSTA
                // ========================================

                if (
                    avaliado.id ===
                    socket.id
                ) {

                    socket.emit(
                        "erro",
                        "Você não pode votar na própria resposta."
                    );

                    return;

                }


                if (
                    dados.voto !==
                    "correta" &&
                    dados.voto !==
                    "errada"
                ) {

                    return;

                }


                avaliado.votos =
                    avaliado.votos || {};


                // ========================================
                // NÃO PODE VOTAR DUAS VEZES
                // NA MESMA RESPOSTA
                // ========================================

                if (
                    avaliado.votos[
                        socket.id
                    ]
                ) {

                    return;

                }


                // Registra o voto

                avaliado.votos[
                    socket.id
                ] =
                    dados.voto;


                // ========================================
                // AVISA SOMENTE O JOGADOR QUE VOTOU
                // ========================================

                socket.emit(
                    "votoRegistrado",
                    {

                        jogadorId:
                            avaliado.id,

                        voto:
                            dados.voto

                    }
                );


                // ========================================
                // TODOS JÁ VOTARAM?
                // ========================================

                if (
                    todosVotaram(
                        codigo
                    )
                ) {

                    clearInterval(
                        sala.timerVotacao
                    );


                    encerrarVotacao(
                        codigo
                    );

                }

            }
        );


        // =============================================
        // PRÓXIMA RODADA
        // =============================================

        socket.on(
            "proxima",
            () => {

                const codigo =
                    socket.sala;

                const sala =
                    salas[codigo];


                if (!sala)
                    return;


                if (
                    sala.dono !==
                    socket.id
                ) {

                    socket.emit(
                        "erro",
                        "Somente o dono pode iniciar a próxima rodada."
                    );

                    return;

                }


                if (
                    sala.fase !==
                    "resultado"
                ) {

                    return;

                }


                sala.iniciada =
                    false;

                sala.fase =
                    "esperando";


                sala.letra =
                    null;


                sala.tempo =
                    TEMPO_RESPOSTAS;


                sala.stopPor =
                    null;


                sala.indiceCategoria =
                    0;


                sala.categoriaAtual =
                    null;


                sala.jogadores.forEach(
                    jogador => {

                        jogador.respostas =
                            {};

                        jogador.votos =
                            {};

                        jogador.resultados =
                            {};

                        jogador.pontosRodada =
                            0;

                    }
                );


                enviarEstado(
                    codigo
                );


                io.to(codigo).emit(
                    "aguardando"
                );

            }
        );


        // =============================================
        // DESCONECTAR
        // =============================================

        socket.on(
            "disconnect",
            () => {

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
                        j =>
                            j.id !==
                            socket.id
                    );


                if (
                    sala.dono ===
                    socket.id
                ) {

                    if (
                        sala.jogadores.length >
                        0
                    ) {

                        sala.dono =
                            sala.jogadores[0].id;


                        io.to(codigo).emit(
                            "novoDono",
                            sala.dono
                        );

                    }

                    else {

                        clearInterval(
                            sala.timer
                        );

                        clearInterval(
                            sala.timerVotacao
                        );


                        delete salas[codigo];

                        return;

                    }

                }


                enviarEstado(
                    codigo
                );

            }
        );

    }
);


// =====================================================
// SERVIDOR
// =====================================================

server.listen(
    PORT,
    () => {

        console.log(
            `Servidor rodando na porta ${PORT}`
        );

    }
);
