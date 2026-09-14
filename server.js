const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const app=express(), server=http.createServer(app), io=new Server(server);
const PORT=process.env.PORT||3000;
app.use(express.static("public"));
app.get("/health",(req,res)=>res.json({ok:true}));
const salas={}, letras="ABCDEFGH IJLMNOPQRSTUV".replace(/\s/g,"").split(""), categorias=["Nome","Animal","Comida","Objeto","Lugar","Profissão"];
function codigo(){let c;do{c=Math.random().toString(36).slice(2,6).toUpperCase()}while(salas[c]);return c}
function estado(c){let s=salas[c];return {codigo:c,dono:s.dono,jogadores:Object.values(s.jogadores).map(p=>({id:p.id,nome:p.nome,pontos:p.pontos,enviou:p.enviou})),iniciada:s.iniciada}}
function rodada(c){let s=salas[c];s.letra=letras[Math.floor(Math.random()*letras.length)];s.iniciada=true;s.tempo=60;Object.values(s.jogadores).forEach(p=>{p.respostas={};p.enviou=false});io.to(c).emit("rodada",{letra:s.letra,tempo:60,categorias});clearInterval(s.timer);s.timer=setInterval(()=>{s.tempo--;io.to(c).emit("tempo",s.tempo);if(s.tempo<=0)finalizar(c)},1000)}
function finalizar(c){let s=salas[c];if(!s||!s.iniciada)return;clearInterval(s.timer);s.iniciada=false;let r=Object.values(s.jogadores).map(p=>{let n=0;for(const cat of categorias){let x=(p.respostas[cat]||"").trim();if(x&&x.toUpperCase().startsWith(s.letra))n+=10}p.pontos+=n;return {nome:p.nome,pontosRodada:n,pontos:p.pontos}});io.to(c).emit("resultado",r)}
io.on("connection",socket=>{
 socket.on("criarSala",nome=>{nome=String(nome||"").trim();if(!nome)return socket.emit("erro","Digite seu nome.");let c=codigo();salas[c]={dono:socket.id,jogadores:{},iniciada:false,timer:null};salas[c].jogadores[socket.id]={id:socket.id,nome,pontos:0,respostas:{},enviou:false};socket.join(c);socket.sala=c;socket.emit("salaCriada",c);io.to(c).emit("estadoSala",estado(c))});
 socket.on("entrarSala",({nome,codigo:c})=>{nome=String(nome||"").trim();c=String(c||"").trim().toUpperCase();let s=salas[c];if(!nome)return socket.emit("erro","Digite seu nome.");if(!s)return socket.emit("erro","Sala não encontrada.");if(s.iniciada)return socket.emit("erro","A rodada já começou.");s.jogadores[socket.id]={id:socket.id,nome,pontos:0,respostas:{},enviou:false};socket.join(c);socket.sala=c;socket.emit("entrouSala",c);io.to(c).emit("estadoSala",estado(c))});
 socket.on("iniciar",()=>{let c=socket.sala;if(c&&salas[c]&&salas[c].dono===socket.id)rodada(c)});
 socket.on("respostas",r=>{let s=salas[socket.sala];if(!s||!s.iniciada||!s.jogadores[socket.id])return;s.jogadores[socket.id].respostas=r||{};s.jogadores[socket.id].enviou=true;io.to(socket.sala).emit("estadoSala",estado(socket.sala))});
 socket.on("stop",()=>finalizar(socket.sala));
 socket.on("proxima",()=>{let c=socket.sala;if(c&&salas[c]&&salas[c].dono===socket.id)rodada(c)});
 socket.on("disconnect",()=>{let c=socket.sala,s=salas[c];if(!s)return;delete s.jogadores[socket.id];if(s.dono===socket.id){let ids=Object.keys(s.jogadores);if(ids.length){s.dono=ids[0];io.to(c).emit("novoDono",s.dono)}}if(!Object.keys(s.jogadores).length){clearInterval(s.timer);delete salas[c]}else io.to(c).emit("estadoSala",estado(c))});
});
server.listen(PORT,"0.0.0.0",()=>console.log("STOP Multiplayer online na porta "+PORT));
