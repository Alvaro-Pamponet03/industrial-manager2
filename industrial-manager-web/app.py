from flask import Flask, render_template, request, jsonify
import random
import math
import os
import time

app = Flask(__name__)

PRODUTOS = {
    "Peça Simples": {
        "valor_venda": 40, "custo_material": 15, "tempo": 5
    },
    "Componente": {
        "valor_venda": 85, "custo_material": 35, "tempo": 8
    },
    "Equipamento": {
        "valor_venda": 180, "custo_material": 80, "tempo": 12
    },
}

MODELOS = {
    "prensa": {
        "nome": "Prensa", "capacidade": 2,
        "custo": 400, "produto": "Peça Simples"
    },
    "montagem": {
        "nome": "Montagem", "capacidade": 4,
        "custo": 800, "produto": "Componente"
    },
    "forno": {
        "nome": "Forno", "capacidade": 6,
        "custo": 1200, "produto": "Equipamento"
    },
}

CORES = [
    "#3498db", "#e74c3c", "#2ecc71",
    "#9b59b6", "#f39c12", "#1abc9c"
]


def novo_jogo(nomes=None):
    nomes = nomes or ["Funcionário 1", "Funcionário 2"]

    jogo = {
        "dinheiro": 1000.0,
        "dia": 1,
        "tempo_dia": 0,
        "rodando": True,
        "funcionarios": [],
        "maquinas": [],
        "estoque": {p: 0 for p in PRODUTOS},
        "producao_total": 0,
        "vendas_total": 0,
        "mensagem": "Bem-vindo à sua fábrica!",
        "ultimo_tick": time.time(),
    }

    for nome in nomes[:2]:
        jogo["funcionarios"].append({
            "nome": str(nome)[:30],
            "motivacao": random.randint(75, 100),
            "salario": 50,
            "presente": True,
            "cor": random.choice(CORES),
            "x": random.randint(100, 800),
            "y": random.randint(220, 480),
            "maquina": None,
            "estado": "andando",
        })

    for tipo, x in [("prensa", 260), ("montagem", 520)]:
        modelo = MODELOS[tipo]
        jogo["maquinas"].append({
            "nome": f'{modelo["nome"]} {len(jogo["maquinas"]) + 1}',
            "tipo": tipo,
            "x": x,
            "y": 300,
            "capacidade": modelo["capacidade"],
            "custo": modelo["custo"],
            "produto": modelo["produto"],
            "durabilidade": 100,
            "funcionando": True,
            "produzindo": False,
            "tempo_producao": 0,
            "quantidade_producao": 0,
            "producao_total": 0,
            "funcionario": None,
        })

    return jogo


def numero(valor, padrao=0):
    try:
        resultado = float(valor)
        return resultado if math.isfinite(resultado) else padrao
    except (TypeError, ValueError):
        return padrao


def atualizar(jogo, delta):
    if not jogo["rodando"]:
        return

    delta = max(0, min(numero(delta), 5))
    jogo["tempo_dia"] += delta

    for maquina in jogo["maquinas"]:
        if not maquina["funcionando"] or not maquina["produzindo"]:
            continue

        maquina["tempo_producao"] -= delta

        if maquina["tempo_producao"] <= 0:
            maquina["tempo_producao"] = 0
            maquina["produzindo"] = False

            qtd = maquina["quantidade_producao"]
            produto = maquina["produto"]
            jogo["estoque"][produto] += qtd
            jogo["producao_total"] += qtd
            maquina["producao_total"] += qtd

            indice = maquina["funcionario"]
            if indice is not None and indice < len(jogo["funcionarios"]):
                f = jogo["funcionarios"][indice]
                f["estado"] = "andando"
                f["maquina"] = None

            maquina["funcionario"] = None
            maquina["quantidade_producao"] = 0
            jogo["mensagem"] = f'{maquina["nome"]} produziu {qtd}x {produto}.'

    # Movimento simples dos funcionários.
    for f in jogo["funcionarios"]:
        if not f["presente"] or f["estado"] == "produzindo":
            continue

        if random.random() < 0.025:
            f["x"] = random.randint(80, 830)
            f["y"] = random.randint(180, 500)

    # Um dia dura 30 minutos de jogo.
    while jogo["tempo_dia"] >= 1800:
        jogo["tempo_dia"] -= 1800
        passar_dia(jogo)


def passar_dia(jogo):
    jogo["dia"] += 1
    salarios = sum(f["salario"] for f in jogo["funcionarios"])
    jogo["dinheiro"] -= salarios

    for f in jogo["funcionarios"]:
        chance_falta = max(2, 25 - f["motivacao"] // 5)
        f["presente"] = random.randint(1, 100) > chance_falta

        if f["presente"]:
            f["motivacao"] = max(0, f["motivacao"] - random.randint(2, 5))
        else:
            f["motivacao"] = min(100, f["motivacao"] + 10)

        f["estado"] = "andando"
        f["maquina"] = None

    for m in jogo["maquinas"]:
        if m["produzindo"] and m["funcionario"] is not None:
            i = m["funcionario"]
            if i < len(jogo["funcionarios"]):
                jogo["funcionarios"][i]["estado"] = "andando"
                jogo["funcionarios"][i]["maquina"] = None

        m["produzindo"] = False
        m["tempo_producao"] = 0
        m["quantidade_producao"] = 0
        m["funcionario"] = None

        if m["funcionando"]:
            m["durabilidade"] = max(
                0, m["durabilidade"] - random.randint(3, 8)
            )
            if m["durabilidade"] == 0:
                m["funcionando"] = False

    jogo["mensagem"] = f"Dia {jogo['dia']} iniciado. Salários: ${salarios:.2f}"


def executar_acao(jogo, dados):
    acao = dados.get("acao", "")
    indice = dados.get("indice", -1)

    if acao == "pausar":
        jogo["rodando"] = not jogo["rodando"]
        jogo["mensagem"] = "Jogo pausado." if not jogo["rodando"] else "Jogo retomado."

    elif acao == "produzir":
        if not jogo["rodando"]:
            jogo["mensagem"] = "Retome o jogo antes de produzir."
            return

        ocupados = {
            m["funcionario"] for m in jogo["maquinas"]
            if m["produzindo"] and m["funcionario"] is not None
        }

        feitos = 0
        for i, m in enumerate(jogo["maquinas"]):
            if not m["funcionando"] or m["produzindo"]:
                continue

            funcionario = next((
                (j, f) for j, f in enumerate(jogo["funcionarios"])
                if f["presente"] and j not in ocupados
                and f["estado"] != "produzindo"
            ), None)

            if funcionario is None:
                break

            j, f = funcionario
            produto = PRODUTOS[m["produto"]]
            qtd = max(1, int(m["capacidade"] * f["motivacao"] / 100))
            custo = produto["custo_material"] * qtd

            if jogo["dinheiro"] < custo:
                continue

            jogo["dinheiro"] -= custo
            m["produzindo"] = True
            m["tempo_producao"] = produto["tempo"]
            m["quantidade_producao"] = qtd
            m["funcionario"] = j
            f["estado"] = "produzindo"
            f["maquina"] = i
            ocupados.add(j)
            feitos += 1

        jogo["mensagem"] = (
            f"{feitos} produção(ões) iniciada(s)."
            if feitos else "Sem funcionários, máquinas ou dinheiro para produzir."
        )

    elif acao == "contratar":
        nome = str(dados.get("nome", "")).strip()[:30]
        if not nome:
            jogo["mensagem"] = "Digite um nome."
        elif jogo["dinheiro"] < 150:
            jogo["mensagem"] = "Dinheiro insuficiente."
        elif len(jogo["funcionarios"]) >= 30:
            jogo["mensagem"] = "Limite de funcionários atingido."
        else:
            jogo["dinheiro"] -= 150
            jogo["funcionarios"].append({
                "nome": nome, "motivacao": random.randint(75, 100),
                "salario": 50, "presente": True,
                "cor": random.choice(CORES),
                "x": random.randint(100, 800),
                "y": random.randint(220, 480),
                "maquina": None, "estado": "andando"
            })
            jogo["mensagem"] = f"{nome} foi contratado."

    elif acao == "comprar_maquina":
        tipo = dados.get("tipo")
        modelo = MODELOS.get(tipo)
        x = numero(dados.get("x"), 450)
        y = numero(dados.get("y"), 400)

        if modelo is None:
            jogo["mensagem"] = "Tipo de máquina inválido."
        elif jogo["dinheiro"] < modelo["custo"]:
            jogo["mensagem"] = "Dinheiro insuficiente."
        elif len(jogo["maquinas"]) >= 20:
            jogo["mensagem"] = "Limite de máquinas atingido."
        elif any(math.hypot(x-m["x"], y-m["y"]) < 145 for m in jogo["maquinas"]):
            jogo["mensagem"] = "Local muito próximo de outra máquina."
        else:
            x = max(100, min(800, x))
            y = max(220, min(480, y))
            jogo["dinheiro"] -= modelo["custo"]
            jogo["maquinas"].append({
                "nome": f'{modelo["nome"]} {len(jogo["maquinas"])+1}',
                "tipo": tipo, "x": x, "y": y,
                "capacidade": modelo["capacidade"],
                "custo": modelo["custo"], "produto": modelo["produto"],
                "durabilidade": 100, "funcionando": True,
                "produzindo": False, "tempo_producao": 0,
                "quantidade_producao": 0, "producao_total": 0,
                "funcionario": None
            })
            jogo["mensagem"] = "Máquina comprada."

    elif acao == "vender_produto":
        produto = dados.get("produto")
        if produto not in PRODUTOS:
            jogo["mensagem"] = "Produto inválido."
        else:
            qtd = jogo["estoque"][produto]
            if qtd <= 0:
                jogo["mensagem"] = "Produto indisponível no estoque."
            else:
                valor = qtd * PRODUTOS[produto]["valor_venda"]
                jogo["estoque"][produto] = 0
                jogo["dinheiro"] += valor
                jogo["vendas_total"] += qtd
                jogo["mensagem"] = f"{qtd} unidades vendidas por ${valor:.2f}."

    elif acao in ("reparar", "vender_maquina"):
        if not isinstance(indice, int) or not 0 <= indice < len(jogo["maquinas"]):
            jogo["mensagem"] = "Máquina inválida."
            return

        m = jogo["maquinas"][indice]

        if acao == "reparar":
            custo = m["custo"] * 0.20
            if m["produzindo"]:
                jogo["mensagem"] = "A máquina está produzindo."
            elif jogo["dinheiro"] < custo:
                jogo["mensagem"] = "Dinheiro insuficiente."
            else:
                jogo["dinheiro"] -= custo
                m["durabilidade"] = 100
                m["funcionando"] = True
                jogo["mensagem"] = f'{m["nome"]} reparada.'

        else:
            if m["produzindo"]:
                jogo["mensagem"] = "Não é possível vender durante a produção."
            else:
                valor = m["custo"] * max(0.20, m["durabilidade"] / 100) * 0.60
                jogo["dinheiro"] += valor
                jogo["maquinas"].pop(indice)
                for f in jogo["funcionarios"]:
                    f["maquina"] = None
                    if f["estado"] == "produzindo":
                        f["estado"] = "andando"
                jogo["mensagem"] = f'Máquina vendida por ${valor:.2f}.'

    elif acao == "motivar":
        if jogo["dinheiro"] < 100:
            jogo["mensagem"] = "Dinheiro insuficiente."
        else:
            jogo["dinheiro"] -= 100
            for f in jogo["funcionarios"]:
                f["motivacao"] = min(100, f["motivacao"] + 20)
            jogo["mensagem"] = "Equipe motivada!"

    elif acao == "dia_seguinte":
        passar_dia(jogo)

    else:
        jogo["mensagem"] = "Ação desconhecida."


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/novo")
def api_novo():
    dados = request.get_json(silent=True) or {}
    nomes = dados.get("nomes")
    if not isinstance(nomes, list) or len(nomes) < 2:
        nomes = ["Funcionário 1", "Funcionário 2"]
    return jsonify(novo_jogo(nomes))


@app.post("/api/acao")
def api_acao():
    dados = request.get_json(silent=True) or {}
    jogo = dados.get("jogo")
    if not isinstance(jogo, dict):
        return jsonify({"erro": "Estado do jogo inválido."}), 400

    try:
        executar_acao(jogo, dados)
        return jsonify(jogo)
    except (KeyError, TypeError, ValueError, IndexError):
        return jsonify({"erro": "Não foi possível executar essa ação."}), 400


@app.post("/api/tick")
def api_tick():
    dados = request.get_json(silent=True) or {}
    jogo = dados.get("jogo")
    if not isinstance(jogo, dict):
        return jsonify({"erro": "Estado do jogo inválido."}), 400

    try:
        atualizar(jogo, dados.get("delta", 1))
        return jsonify(jogo)
    except (KeyError, TypeError, ValueError, IndexError):
        return jsonify({"erro": "Não foi possível atualizar o jogo."}), 400


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")


