# Apex Journal — Funded Account Tracker

Journal de backtesting y trading en vivo para cuentas fondeadas de **Apex Trader Funding**.

## Features

- **Motor de Riesgo en tiempo real**: Calcula contratos recomendados, riesgo máximo por trade y alertas basadas en tu drawdown actual.
- **Trailing Drawdown Tracker**: Simula el floor de drawdown real de Apex (sube con el balance).
- **Daily Loss Limit**: Bloquea operaciones que excedan el límite diario.
- **Consistency Rule (50%)**: Monitorea que ningún día domine el P&L total.
- **Chequeo pre-trade**: Antes de guardar, valida contratos, R:R, riesgo diario y margen.
- **Estadísticas completas**: Win rate, Profit Factor, Expectancy, Avg Win/Loss.
- **Exportar CSV**: Descarga todo el log para análisis externo.
- **100% local**: Sin backend, sin cuentas. Todos los datos en `localStorage`.

## Deploy en Vercel (1 minuto)

1. Sube esta carpeta a un repositorio GitHub.
2. Ve a [vercel.com](https://vercel.com) → New Project → importa el repo.
3. Framework Preset: **Other** (static).
4. Deploy. ¡Listo!

## Configuración

Al abrir el journal, en el panel izquierdo configura:
- **Balance Inicial**: El balance con que empezaste la cuenta fondeada.
- **Max Drawdown**: $2,000 para la cuenta $50K de Apex.
- **Daily Loss Limit**: $1,000 (o el que aplique a tu cuenta).
- **Consistency Rule**: 50% (regla Apex).
- **Contratos Máx**: 4 mini / 40 micro.
- **Objetivo Colchón**: Cuánto profit quieres acumular antes de tu primer pago.

## Reglas Apex implementadas

| Regla | Descripción |
|---|---|
| Max Drawdown $2,000 | Trailing EOD — el floor sube con el balance |
| Daily Loss Limit | Alerta si un trade supera el límite restante del día |
| Consistency Rule 50% | Ningún día puede ser > 50% del profit total |
| Max Contracts 4 mini | Validación por trade |
| Payout Split 100% | Campo para tracking de solicitudes |

---
Hecho para traders fondeados que quieren mantener su cuenta viva. 🎯
