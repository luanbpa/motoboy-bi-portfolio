# Medidas DAX sugeridas

Use a tabela `entregas_por_app` como fato principal.

## Medidas basicas

```DAX
Receita Total =
SUM(entregas_por_app[receita_app])
```

```DAX
Total Corridas =
SUM(entregas_por_app[corridas])
```

```DAX
Km Total =
SUM(entregas_por_app[km_app])
```

```DAX
Horas Trabalhadas =
SUMX(
    SUMMARIZE(
        entregas_por_app,
        entregas_por_app[data],
        "HorasDia", MAX(entregas_por_app[horas_trabalhadas])
    ),
    [HorasDia]
)
```

```DAX
Dias Trabalhados =
DISTINCTCOUNT(entregas_por_app[data])
```

## Indicadores de desempenho

Caso crie uma tabela de despesas chamada `despesas`, use:

```DAX
Despesas =
SUM(despesas[valor])
```

```DAX
Receita Liquida =
[Receita Total] - [Despesas]
```

```DAX
Receita Media por Dia =
DIVIDE([Receita Total], [Dias Trabalhados])
```

```DAX
Receita por Hora =
DIVIDE([Receita Total], [Horas Trabalhadas])
```

```DAX
Receita por Km =
DIVIDE([Receita Total], [Km Total])
```

```DAX
Corridas por Hora =
DIVIDE([Total Corridas], [Horas Trabalhadas])
```

```DAX
Ticket Medio por Corrida =
DIVIDE([Receita Total], [Total Corridas])
```

## Sugestao de visuais

- Cartoes: Receita Total, Dias Trabalhados, Receita Media por Dia, Receita por Hora, Receita por Km.
- Cartoes adicionais: Despesas e Receita Liquida.
- Grafico de colunas: Receita por Data.
- Grafico de barras: Total mensal.
- Tabela: Data, Horas, Corridas, Km, Receita, Receita por Hora.
- Segmentadores: App e Data.

## Como permitir entrada de novos dias

Power BI nao e, por padrao, uma ferramenta de digitacao de dados dentro do relatorio. As melhores alternativas sao:

1. **Excel/CSV como entrada**: criar uma tabela `lancamentos_novos` e atualizar o relatorio.
2. **SharePoint List ou Microsoft Lists**: bom para uso online e historico controlado.
3. **Power Apps visual dentro do Power BI**: permite digitar dados diretamente no relatorio, mas pode depender de licenca e configuracao no ambiente Microsoft.
4. **Painel web deste projeto**: permite demonstrar a funcionalidade de entrada direta no portfolio GitHub.
