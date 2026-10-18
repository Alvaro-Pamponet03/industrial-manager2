const canvas = document.getElementById("factory");
const ctx = canvas.getContext("2d");

const SAVE_KEY = "industrial-manager-save-v1";
let jogo = null;
let modoCompra = false;
let ocupado = false;
let ultimaAtualizacao = Date.now();

const produtos = {
  "Peça Simples": 40,
  "Componente": 85,
  "Equipamento": 180
};

async function post(url, body) {
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro || "Erro no servidor.");
  return dados;
}

function salvarLocal() {
  if (!jogo) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(jogo));
}

async function executar(acao, extras = {}) {
  if (!jogo || ocupado) return;
  ocupado = true;

  try {
    jogo = await post("/api/acao", {
      jogo,
      acao,
      ...extras
    });
    salvarLocal();
    renderizarPainel();
  } catch (erro) {
    mostrarMensagem(erro.message);
  } finally {
    ocupado = false;
  }
}

function mostrarMensagem(texto) {
  document.getElementById("message").textContent = texto;
}

async function iniciar() {
  try {
    const salvo = localStorage.getItem(SAVE_KEY);

    if (salvo) {
      try {
        jogo = JSON.parse(salvo);
        if (!jogo || !Array.isArray(jogo.maquinas) ||
            !Array.isArray(jogo.funcionarios) ||
            typeof jogo.dinheiro !== "number") {
          throw new Error("Save inválido");
        }
        mostrarMensagem("Partida recuperada do navegador.");
      } catch {
        localStorage.removeItem(SAVE_KEY);
        jogo = await post("/api/novo", {});
      }
    } else {
      jogo = await post("/api/novo", {});
    }

    salvarLocal();
    renderizarPainel();
    requestAnimationFrame(animar);
  } catch (erro) {
    mostrarMensagem("Não foi possível iniciar: " + erro.message);
  }
}

function renderizarPainel() {
  if (!jogo) return;

  const minutos = Math.floor(jogo.tempo_dia / 60);
  const segundos = Math.floor(jogo.tempo_dia % 60);
  const progresso = (jogo.tempo_dia / 1800 * 100).toFixed(1);

  document.getElementById("status").textContent =
    `$${jogo.dinheiro.toFixed(2)} | Dia ${jogo.dia} | ` +
    `${String(8 + Math.floor(minutos / 60)).padStart(2, "0")}:` +
    `${String(minutos % 60).padStart(2, "0")}:${String(segundos).padStart(2, "0")} | ` +
    `${progresso}% | ${jogo.rodando ? "FUNCIONANDO" : "PAUSADO"}`;

  document.getElementById("stock-total").textContent =
    Object.values(jogo.estoque).reduce((a, b) => a + b, 0);
  document.getElementById("machine-total").textContent = jogo.maquinas.length;
  document.getElementById("employee-total").textContent = jogo.funcionarios.length;

  document.getElementById("inventory").innerHTML = "";
  for (const [nome, qtd] of Object.entries(jogo.estoque)) {
    const row = document.createElement("div");
    row.className = "inventory-row";

    const texto = document.createElement("span");
    texto.textContent = `${nome}: ${qtd}`;

    const botao = document.createElement("button");
    botao.textContent = "Vender";
    botao.disabled = qtd <= 0;
    botao.addEventListener("click", () =>
      executar("vender_produto", { produto: nome })
    );

    row.append(texto, botao);
    document.getElementById("inventory").append(row);
  }

  document.getElementById("employees").innerHTML = "";
  for (const f of jogo.funcionarios) {
    const row = document.createElement("div");
    row.className = "employee-row";
    row.textContent =
      `${f.nome} · ${f.presente ? "Presente" : "Ausente"} · Motivação ${f.motivacao}%`;
    document.getElementById("employees").append(row);
  }

  document.getElementById("pause").textContent =
    jogo.rodando ? "⏸ Pausar" : "▶ Continuar";
  document.getElementById("buy-machine").classList.toggle("active", modoCompra);
  mostrarMensagem(jogo.mensagem || "");
}

function desenharCenario() {
  ctx.fillStyle = "#3b4148";
  ctx.fillRect(0, 0, 900, 600);

  ctx.strokeStyle = "#444b52";
  ctx.lineWidth = 1;
  for (let x = 0; x <= 900; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke();
  }
  for (let y = 0; y <= 600; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(900, y); ctx.stroke();
  }

  ctx.fillStyle = "#292e33";
  ctx.fillRect(20, 20, 230, 90);
  ctx.strokeStyle = "#69727a";
  ctx.strokeRect(30, 125, 840, 425);

  ctx.fillStyle = "#eeeeee";
  ctx.font = "bold 14px Arial";
  ctx.fillText("ADMINISTRAÇÃO", 75, 48);
  ctx.fillText("ÁREA DE PRODUÇÃO", 45, 148);

  ctx.fillStyle = "#9aa0a6";
  ctx.font = "12px Arial";
  ctx.fillText("Escritório", 105, 76);
  ctx.fillText("ENTRADA", 420, 580);

  ctx.fillStyle = "#25292d";
  ctx.fillRect(395, 550, 105, 50);
}

function desenharMaquina(m) {
  const cor = !m.funcionando ? "#632b2b" :
    m.produzindo ? "#357a4a" : "#626a72";

  ctx.fillStyle = cor;
  ctx.fillRect(m.x - 60, m.y - 45, 120, 90);
  ctx.strokeStyle = "#151719";
  ctx.lineWidth = 3;
  ctx.strokeRect(m.x - 60, m.y - 45, 120, 90);

  if (m.tipo === "prensa") {
    ctx.fillStyle = "#bfc5ca";
    ctx.fillRect(m.x - 10, m.y - 35, 20,
      m.produzindo ? 35 + Math.sin(Date.now() / 100) * 8 : 30);
  } else if (m.tipo === "montagem") {
    ctx.fillStyle = "#1c1f22";
    ctx.fillRect(m.x - 45, m.y - 10, 90, 20);
    ctx.fillStyle = "#d9a441";
    ctx.fillRect(m.x - 7 + Math.sin(Date.now() / 200) * 25,
      m.y - 25, 14, 15);
  } else {
    ctx.fillStyle = m.produzindo ? "#ff7a24" : "#3b1d13";
    ctx.beginPath();
    ctx.arc(m.x, m.y, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.font = "bold 12px Arial";
  ctx.fillStyle = "#eeeeee";
  ctx.fillText(m.nome, m.x, m.y + 62);
  ctx.font = "10px Arial";
  ctx.fillStyle = "#d9d9d9";
  ctx.fillText(m.produto, m.x, m.y + 77);
  ctx.fillStyle = m.durabilidade > 50 ? "#43b581" :
    m.durabilidade > 20 ? "#f1c40f" : "#e74c3c";
  ctx.fillText(`${m.durabilidade}%`, m.x, m.y + 90);
  ctx.fillStyle = "#eeeeee";
  ctx.fillText(
    m.produzindo ? `${m.tempo_producao.toFixed(1)}s` :
      m.funcionando ? "PARADA" : "QUEBRADA",
    m.x, m.y - 53
  );
}

function desenharFuncionario(f, i) {
  if (!f.presente) return;

  const x = f.x + Math.sin(Date.now() / 500 + i) * 2;
  const y = f.y;

  ctx.strokeStyle = "#222222";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 22); ctx.lineTo(x - 7, y + 38);
  ctx.moveTo(x + 5, y + 22); ctx.lineTo(x + 7, y + 38);
  ctx.stroke();

  ctx.fillStyle = f.cor || "#3498db";
  ctx.fillRect(x - 12, y - 2, 24, 27);

  ctx.strokeStyle = f.cor || "#3498db";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 11, y + 3); ctx.lineTo(x - 21, y + 17);
  ctx.moveTo(x + 11, y + 3); ctx.lineTo(x + 21, y + 17);
  ctx.stroke();

  ctx.fillStyle = "#f1c27d";
  ctx.beginPath(); ctx.arc(x, y - 10, 10, 0, Math.PI * 2); ctx.fill();

  ctx.textAlign = "center";
  ctx.font = "10px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(f.nome, x, y - 34);
  if (f.estado === "produzindo") ctx.fillText("🔧", x, y + 52);
}

function desenharEstoque() {
  const total = Object.values(jogo.estoque).reduce((a, b) => a + b, 0);
  const quantidade = Math.min(total, 30);

  ctx.fillStyle = "#eeeeee";
  ctx.textAlign = "center";
  ctx.font = "bold 12px Arial";
  ctx.fillText("ESTOQUE", 740, 400);

  for (let i = 0; i < quantidade; i++) {
    ctx.fillStyle = "#d4a72c";
    ctx.fillRect(680 + (i % 6) * 22, 420 + Math.floor(i / 6) * 22, 16, 16);
  }
}

function animar() {
  if (jogo) {
    desenharCenario();
    jogo.maquinas.forEach(desenharMaquina);
    jogo.funcionarios.forEach(desenharFuncionario);
    desenharEstoque();
  }
  requestAnimationFrame(animar);
}

canvas.addEventListener("click", async (evento) => {
  if (!modoCompra || !jogo) return;

  const rect = canvas.getBoundingClientRect();
  const x = (evento.clientX - rect.left) * canvas.width / rect.width;
  const y = (evento.clientY - rect.top) * canvas.height / rect.height;

  if (x < 100 || x > 800 || y < 220 || y > 480) {
    mostrarMensagem("Clique dentro da área permitida.");
    return;
  }

  modoCompra = false;
  await executar("comprar_maquina", {
    tipo: document.getElementById("machine-type").value,
    x, y
  });
  renderizarPainel();
});

document.getElementById("pause").addEventListener("click", () => executar("pausar"));
document.getElementById("produce").addEventListener("click", () => executar("produzir"));
document.getElementById("motivate").addEventListener("click", () => executar("motivar"));

document.getElementById("buy-machine").addEventListener("click", () => {
  modoCompra = !modoCompra;
  renderizarPainel();
  mostrarMensagem(modoCompra
    ? "Escolha o tipo de máquina e clique na área de produção."
    : "Compra cancelada.");
});

document.getElementById("hire").addEventListener("click", () => {
  const nome = prompt("Nome do novo funcionário:");
  if (nome && nome.trim()) executar("contratar", { nome: nome.trim() });
});

document.getElementById("repair").addEventListener("click", async () => {
  if (!jogo?.maquinas.length) return mostrarMensagem("Nenhuma máquina.");
  const opcoes = jogo.maquinas.map((m, i) =>
    `${i}: ${m.nome} (${m.durabilidade}%)`).join("\n");
  const indice = Number(prompt("Qual máquina deseja reparar?\n" + opcoes));
  if (Number.isInteger(indice)) await executar("reparar", { indice });
});

document.getElementById("sell-machine").addEventListener("click", async () => {
  if (!jogo?.maquinas.length) return mostrarMensagem("Nenhuma máquina.");
  const opcoes = jogo.maquinas.map((m, i) =>
    `${i}: ${m.nome} (${m.durabilidade}%)`).join("\n");
  const indice = Number(prompt("Qual máquina deseja vender?\n" + opcoes));
  if (Number.isInteger(indice) &&
      confirm(`Confirma a venda de ${jogo.maquinas[indice]?.nome || "esta máquina"}?`)) {
    await executar("vender_maquina", { indice });
  }
});

document.getElementById("save").addEventListener("click", () => {
  salvarLocal();
  mostrarMensagem("Partida salva neste navegador.");
});

document.getElementById("reset").addEventListener("click", async () => {
  if (!confirm("Começar uma nova partida? O save atual será substituído.")) return;
  const nome1 = prompt("Nome do funcionário 1:") || "Funcionário 1";
  const nome2 = prompt("Nome do funcionário 2:") || "Funcionário 2";
  try {
    jogo = await post("/api/novo", { nomes: [nome1, nome2] });
    modoCompra = false;
    salvarLocal();
    renderizarPainel();
  } catch (erro) {
    mostrarMensagem(erro.message);
  }
});

// Sincroniza o tempo com o servidor uma vez por segundo.
setInterval(async () => {
  if (!jogo || ocupado || !jogo.rodando) return;
  ocupado = true;
  try {
    const agora = Date.now();
    const delta = Math.min((agora - ultimaAtualizacao) / 1000, 5);
    ultimaAtualizacao = agora;
    jogo = await post("/api/tick", { jogo, delta });
    salvarLocal();
    renderizarPainel();
  } catch (erro) {
    mostrarMensagem("Erro de atualização: " + erro.message);
  } finally {
    ocupado = false;
  }
}, 1000);

window.addEventListener("beforeunload", salvarLocal);
iniciar();


