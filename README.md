# Dashboard BI - Ganhos como Motoboy de App

Projeto de portfolio em Analise de Dados/BI baseado em uma planilha real de controle financeiro de entregas por aplicativo.

O objetivo e transformar uma planilha operacional em uma base analitica, criar indicadores de desempenho e facilitar a atualizacao dos dados por meio de um painel com formulario de novos lancamentos.

## Objetivo do projeto

- Acompanhar receita total, media por dia, receita por hora e receita por km.
- Acompanhar despesas e receita liquida.
- Projetar receita liquida minima, esperada e real considerando 22 dias de trabalho no mes.
- Estimar quantos dias e horas ainda seriam necessarios para superar a receita liquida minima mensal.
- Acompanhar horas trabalhadas e media de horas por dia.
- Exibir comparativos agrupados em barras de faixa, com minimo, real e esperado na propria visualizacao.
- Classificar cada dia como acima ou abaixo do esperado.
- Filtrar o painel por mes atual, historico de meses anteriores ou acumulado.
- Comparar desempenho por aplicativo.
- Identificar dias mais produtivos e variacoes de ganho.
- Criar uma base limpa para uso em Power BI.
- Permitir adicionar novos dias trabalhados diretamente no painel web.

## Dados utilizados

A base original esta em:

`data/raw/financas_luan_motoboy.csv`

O script `scripts/prepare_data.py` transforma a planilha original em tabelas analiticas:

- `data/processed/entregas_por_app.csv`
- `data/processed/resumo_diario.csv`
- `data/processed/resumo_por_app.csv`
- `data/processed/modelo_lancamentos_novos.csv`

## Principais metricas

- Receita total
- Despesas
- Receita liquida
- Valor minimo diario
- Valor esperado diario
- Dias trabalhados
- Horas trabalhadas
- Media de horas por dia
- Receita media por dia
- Receita por hora
- Receita por km
- Total de corridas
- Corridas por hora
- Status diario: acima do esperado ou abaixo do esperado
- Participacao de receita por app

## Regra de status diario

O parametro de comparacao diaria vem do campo `ESPERADO DIA` da planilha original. No dashboard:

- Verde: receita do dia maior ou igual ao esperado.
- Vermelho: receita do dia abaixo do esperado.

O grafico de receita por dia mostra uma linha pontilhada com o valor esperado e pinta cada barra conforme o resultado do dia. Os cards de receita tambem mudam de cor:

- Verde: resultado acima ou igual ao esperado no periodo selecionado.
- Vermelho: resultado abaixo do esperado no periodo selecionado.

## Filtro de periodo

O dashboard abre no mes mais recente disponivel na base, tratado como `Mes atual` do painel. O seletor de periodo permite alternar entre:

- Mes atual
- Acumulado
- Meses historicos disponiveis na base

Todos os KPIs, graficos e tabelas respondem ao periodo selecionado.

## Como executar

1. Atualize a planilha original em `data/raw/financas_luan_motoboy.csv`.
2. Rode o tratamento:

```bash
python scripts/prepare_data.py
```

3. Abra o dashboard com o servidor local do projeto.

Exemplo:

```bash
python scripts/server.py 8002
```

Depois acesse:

`http://localhost:8002/dashboard_web/`

Tambem e possivel abrir pelo arquivo:

`Abrir Dashboard Motoboy.bat`

Esse atalho inicia o servidor local na porta 8002, se ele ainda nao estiver rodando, e abre o dashboard no navegador.

## Atualizacao pelo painel

O painel web possui um formulario para adicionar novos lancamentos. Quando executado pelo servidor `scripts/server.py`, os dados adicionados sao salvos em arquivos CSV locais:

- `data/local/lancamentos_dashboard.csv`
- `data/local/despesas_dashboard.csv`
- `data/processed/modelo_lancamentos_novos.csv`, sincronizado com os lancamentos do painel para uso como planilha de entrada.

Se o dashboard for aberto sem o servidor local, ele usa `localStorage` do navegador como fallback.

O painel tambem possui um formulario de gastos para registrar despesas como gasolina, manutencao, alimentacao, garagem e outros custos. Esses gastos ficam salvos em `data/local/despesas_dashboard.csv` e entram no calculo de receita liquida:

`Receita liquida = Receita total - Despesas`

Para um uso profissional em Power BI, a alternativa recomendada e manter os lancamentos em uma tabela de entrada, como Excel, SharePoint List, Google Sheets ou Dataverse. Para entrada diretamente no relatorio Power BI, o caminho mais adequado e usar o visual do Power Apps integrado ao modelo.

## Aprendizados demonstrados

- Tratamento de dados em Python.
- Modelagem de dados para BI.
- Criacao de indicadores.
- Visualizacao de dados.
- Documentacao de metricas.
- Pensamento analitico aplicado a um problema real de renda variavel.

## Proximos passos

- Criar arquivo `.pbix` no Power BI Desktop usando os CSVs processados.
- Publicar imagens do dashboard no GitHub.
- Adicionar analise de custos: gasolina, manutencao e margem liquida.
- Criar metas mensais e acompanhamento de resultado esperado.
