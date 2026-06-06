from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import csv
import json
import sys
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
LOCAL_DIR = ROOT / "data" / "local"
PROCESSED_DIR = ROOT / "data" / "processed"
ENTRIES_FILE = LOCAL_DIR / "lancamentos_dashboard.csv"
EXPENSES_FILE = LOCAL_DIR / "despesas_dashboard.csv"
ENTRY_MODEL_FILE = PROCESSED_DIR / "modelo_lancamentos_novos.csv"

ENTRY_FIELDS = ["data", "app", "horas", "kmDia", "corridas", "kmApp", "receita"]
EXPENSE_FIELDS = ["data", "categoria", "valor", "observacao"]
ENTRY_MODEL_FIELDS = [
    "data",
    "horas_trabalhadas",
    "km_dia_total",
    "app",
    "corridas",
    "km_app",
    "receita_app",
    "campanha",
    "gasolina",
    "manutencao",
    "garagem",
]


def ensure_file(path, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with path.open("w", newline="", encoding="utf-8-sig") as file:
            csv.DictWriter(file, fieldnames=fields).writeheader()


def ensure_trailing_newline(path):
    if not path.exists() or path.stat().st_size == 0:
        return
    with path.open("rb") as file:
        file.seek(-1, 2)
        last_byte = file.read(1)
    if last_byte not in (b"\n", b"\r"):
        with path.open("ab") as file:
            file.write(b"\n")


def read_rows(path, fields):
    ensure_file(path, fields)
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def sync_entry_model(rows):
    ensure_file(ENTRY_MODEL_FILE, ENTRY_MODEL_FIELDS)
    model_rows = [
        {
            "data": row.get("data", ""),
            "horas_trabalhadas": row.get("horas", ""),
            "km_dia_total": row.get("kmDia", ""),
            "app": row.get("app", ""),
            "corridas": row.get("corridas", ""),
            "km_app": row.get("kmApp", row.get("kmDia", "")),
            "receita_app": row.get("receita", ""),
            "campanha": "0",
            "gasolina": "0",
            "manutencao": "0",
            "garagem": "0",
        }
        for row in rows
    ]
    with ENTRY_MODEL_FILE.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=ENTRY_MODEL_FIELDS)
        writer.writeheader()
        writer.writerows(model_rows)


def append_row(path, fields, row):
    ensure_file(path, fields)
    ensure_trailing_newline(path)
    clean = {field: str(row.get(field, "")).strip() for field in fields}
    with path.open("a", newline="", encoding="utf-8-sig") as file:
        csv.DictWriter(file, fieldnames=fields).writerow(clean)
    if path == ENTRIES_FILE:
        sync_entry_model(read_rows(ENTRIES_FILE, ENTRY_FIELDS))
    return clean


def replace_rows(path, fields, rows):
    ensure_file(path, fields)
    clean_rows = [{field: str(row.get(field, "")).strip() for field in fields} for row in rows]
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(clean_rows)
    if path == ENTRIES_FILE:
        sync_entry_model(clean_rows)
    return clean_rows


def clear_file(path, fields):
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        csv.DictWriter(file, fieldnames=fields).writeheader()
    if path == ENTRIES_FILE:
        sync_entry_model([])


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/dashboard_web/")
            self.end_headers()
            return
        if path == "/api/health":
            sync_entry_model(read_rows(ENTRIES_FILE, ENTRY_FIELDS))
            self.send_json({"ok": True, "dashboard": "/dashboard_web/"})
            return
        if path == "/api/entries":
            self.send_json(read_rows(ENTRIES_FILE, ENTRY_FIELDS))
            return
        if path == "/api/expenses":
            self.send_json(read_rows(EXPENSES_FILE, EXPENSE_FIELDS))
            return
        super().do_GET()

    def do_POST(self):
        try:
            if self.path == "/api/entries":
                self.send_json(append_row(ENTRIES_FILE, ENTRY_FIELDS, self.read_json_body()), status=201)
                return
            if self.path == "/api/expenses":
                self.send_json(append_row(EXPENSES_FILE, EXPENSE_FIELDS, self.read_json_body()), status=201)
                return
            if self.path == "/api/reset-local":
                clear_file(ENTRIES_FILE, ENTRY_FIELDS)
                clear_file(EXPENSES_FILE, EXPENSE_FIELDS)
                self.send_json({"ok": True})
                return
            self.send_json({"error": "Endpoint nao encontrado"}, status=404)
        except Exception as error:
            self.send_json({"error": str(error)}, status=500)

    def do_PUT(self):
        try:
            if self.path == "/api/entries":
                rows = self.read_json_body()
                if not isinstance(rows, list):
                    self.send_json({"error": "Envie uma lista de lancamentos"}, status=400)
                    return
                self.send_json(replace_rows(ENTRIES_FILE, ENTRY_FIELDS, rows))
                return
            if self.path == "/api/expenses":
                rows = self.read_json_body()
                if not isinstance(rows, list):
                    self.send_json({"error": "Envie uma lista de gastos"}, status=400)
                    return
                self.send_json(replace_rows(EXPENSES_FILE, EXPENSE_FIELDS, rows))
                return
            self.send_json({"error": "Endpoint nao encontrado"}, status=404)
        except Exception as error:
            self.send_json({"error": str(error)}, status=500)


def main():
    ensure_file(ENTRIES_FILE, ENTRY_FIELDS)
    ensure_file(EXPENSES_FILE, EXPENSE_FIELDS)
    sync_entry_model(read_rows(ENTRIES_FILE, ENTRY_FIELDS))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8002
    server = ThreadingHTTPServer(("localhost", port), Handler)
    print(f"Dashboard rodando em http://localhost:{port}/dashboard_web/")
    print(f"Receitas salvas em {ENTRIES_FILE}")
    print(f"Despesas salvas em {EXPENSES_FILE}")
    server.serve_forever()


if __name__ == "__main__":
    main()
