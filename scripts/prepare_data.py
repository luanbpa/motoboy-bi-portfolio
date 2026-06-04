from pathlib import Path
import re

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW_FILE = ROOT / "data" / "raw" / "financas_luan_motoboy.csv"
OUT_DIR = ROOT / "data" / "processed"


def parse_number(value):
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("R$", "").replace(" ", "")
    text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def parse_date(day_month, year=2026):
    if pd.isna(day_month):
        return None
    text = str(day_month).strip().lower()
    months = {
        "jan": 1,
        "fev": 2,
        "mar": 3,
        "abr": 4,
        "mai": 5,
        "jun": 6,
        "jul": 7,
        "ago": 8,
        "set": 9,
        "out": 10,
        "nov": 11,
        "dez": 12,
    }
    match = re.match(r"(\d{1,2})/([a-zç]{3})", text)
    if not match:
        return None
    day = int(match.group(1))
    month = months.get(match.group(2))
    if not month:
        return None
    return pd.Timestamp(year=year, month=month, day=day)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    raw = pd.read_csv(RAW_FILE, sep=";", encoding="utf-8-sig", header=None)
    minimum_day = parse_number(raw.iloc[2, 16]) if raw.shape[1] > 16 else None
    expected_day = parse_number(raw.iloc[2, 17]) if raw.shape[1] > 17 else None
    headers = [str(x).strip() for x in raw.iloc[1].fillna("").tolist()]
    app_idx = headers.index("APP")
    start_idx = 1 if app_idx >= 7 and headers[app_idx - 7] == "ESPERADO/HORA" else 0
    end_idx = app_idx + 8 if "TOTAL COM CAMPANHAS" in headers else app_idx + 8
    data = raw.iloc[2:, start_idx:end_idx].copy()

    if start_idx == 1:
        data.columns = [
            "ESPERADO/HORA",
            "MINIMO/HORA",
            "HORAS/TRAB",
            "DIAS",
            "DIA/MES",
            "DIA/TRAB",
            "KM/DIA",
            "APP",
            "CORRIDAS",
            "KM",
            "VALOR/KM",
            "VALOR",
            "TOTAL DIA",
            "TOTAL ACUMULADO",
            "TOTAL COM CAMPANHAS",
        ]
    else:
        data.columns = [
            "HORAS/TRAB",
            "DIAS",
            "DIA/MES",
            "DIA/TRAB",
            "KM/DIA",
            "APP",
            "CORRIDAS",
            "KM",
            "VALOR/KM",
            "KM-CUSTO KM",
            "VALOR",
            "TOTAL DIA",
            "TOTAL ACUMULADO",
        ]
        data["ESPERADO/HORA"] = pd.NA
        data["MINIMO/HORA"] = pd.NA
        data["TOTAL COM CAMPANHAS"] = pd.NA

    app_rows = data[data["APP"].isin(["IFOOD", "KEETA"])].copy()

    day_columns = [
        "ESPERADO/HORA",
        "MINIMO/HORA",
        "HORAS/TRAB",
        "DIAS",
        "DIA/MES",
        "DIA/TRAB",
        "KM/DIA",
        "TOTAL DIA",
        "TOTAL ACUMULADO",
        "TOTAL COM CAMPANHAS",
    ]
    for column in day_columns:
        app_rows[column] = app_rows[column].ffill()

    records = []
    for _, row in app_rows.iterrows():
        records.append(
            {
                "data": parse_date(row["DIA/MES"]),
                "dia_mes": row["DIA/MES"],
                "dia_trabalhado": int(parse_number(row["DIA/TRAB"]) or 0),
                "horas_trabalhadas": parse_number(row["HORAS/TRAB"]),
                "km_dia_total": parse_number(row["KM/DIA"]),
                "app": row["APP"],
                "corridas": int(parse_number(row["CORRIDAS"]) or 0),
                "km_app": parse_number(row["KM"]),
                "valor_km_app": parse_number(row["VALOR/KM"]),
                "receita_app": parse_number(row["VALOR"]),
                "receita_dia": parse_number(row["TOTAL DIA"]),
                "acumulado": parse_number(row["TOTAL ACUMULADO"]),
                "acumulado_com_campanhas": parse_number(row["TOTAL COM CAMPANHAS"]),
                "meta_hora": parse_number(row["ESPERADO/HORA"]),
                "minimo_hora": parse_number(row["MINIMO/HORA"]),
            }
        )

    entregas = pd.DataFrame(records).dropna(subset=["data", "app"])
    entregas["receita_por_hora_app"] = entregas["receita_app"] / entregas["horas_trabalhadas"]
    entregas["receita_por_km_app"] = entregas["receita_app"] / entregas["km_app"].replace({0: pd.NA})
    entregas["corridas_por_hora"] = entregas["corridas"] / entregas["horas_trabalhadas"]

    dia = (
        entregas.groupby(["data", "dia_mes", "dia_trabalhado"], as_index=False)
        .agg(
            horas_trabalhadas=("horas_trabalhadas", "first"),
            km_dia_total=("km_dia_total", "first"),
            corridas=("corridas", "sum"),
            receita_bruta=("receita_app", "sum"),
            receita_dia=("receita_dia", "first"),
            acumulado=("acumulado", "first"),
            acumulado_com_campanhas=("acumulado_com_campanhas", "first"),
            meta_hora=("meta_hora", "first"),
            minimo_hora=("minimo_hora", "first"),
        )
        .sort_values("data")
    )
    dia["receita_por_hora"] = dia["receita_dia"] / dia["horas_trabalhadas"]
    dia["receita_por_km"] = dia["receita_dia"] / dia["km_dia_total"].replace({0: pd.NA})
    dia["corridas_por_hora"] = dia["corridas"] / dia["horas_trabalhadas"]
    dia["minimo_dia"] = minimum_day
    dia["meta_dia"] = expected_day
    dia["diferenca_meta_dia"] = dia["receita_dia"] - expected_day if expected_day else pd.NA
    def classify_day_goal(value):
        if expected_day and value >= expected_day:
            return "Acima do esperado"
        if minimum_day and value >= minimum_day:
            return "Dentro do intervalo"
        return "Abaixo do minimo"

    dia["status_meta_dia"] = dia["receita_dia"].apply(classify_day_goal)
    def classify_hour_goal(row):
        if pd.isna(row["meta_hora"]) or pd.isna(row["minimo_hora"]):
            return "Sem meta informada"
        if row["receita_por_hora"] >= row["meta_hora"]:
            return "Acima da meta"
        if row["receita_por_hora"] >= row["minimo_hora"]:
            return "Acima do minimo"
        return "Abaixo do minimo"

    dia["status_meta_hora"] = dia.apply(classify_hour_goal, axis=1)

    resumo_app = (
        entregas.groupby("app", as_index=False)
        .agg(corridas=("corridas", "sum"), km=("km_app", "sum"), receita=("receita_app", "sum"))
        .sort_values("receita", ascending=False)
    )
    resumo_app["receita_por_corrida"] = resumo_app["receita"] / resumo_app["corridas"]
    resumo_app["receita_por_km"] = resumo_app["receita"] / resumo_app["km"]

    input_template = pd.DataFrame(
        [
            {
                "data": "2026-06-01",
                "horas_trabalhadas": 4,
                "km_dia_total": 80,
                "app": "IFOOD",
                "corridas": 5,
                "km_app": 35.5,
                "receita_app": 92.50,
                "campanha": 0,
                "gasolina": 25,
                "manutencao": 5,
                "garagem": 0,
            },
            {
                "data": "2026-06-01",
                "horas_trabalhadas": 4,
                "km_dia_total": 80,
                "app": "KEETA",
                "corridas": 4,
                "km_app": 44.5,
                "receita_app": 105.30,
                "campanha": 20,
                "gasolina": 0,
                "manutencao": 0,
                "garagem": 0,
            },
        ]
    )

    entregas.to_csv(OUT_DIR / "entregas_por_app.csv", index=False, encoding="utf-8-sig")
    dia.to_csv(OUT_DIR / "resumo_diario.csv", index=False, encoding="utf-8-sig")
    resumo_app.to_csv(OUT_DIR / "resumo_por_app.csv", index=False, encoding="utf-8-sig")
    input_template.to_csv(OUT_DIR / "modelo_lancamentos_novos.csv", index=False, encoding="utf-8-sig")

    print(f"Registros por app: {len(entregas)}")
    print(f"Dias trabalhados: {len(dia)}")
    print(f"Receita total: R$ {dia['receita_dia'].sum():,.2f}")


if __name__ == "__main__":
    main()
