# Text Widget Examples

## Example 1: Current Temperature (Open-Meteo)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = weatherLondon`.
4. Set `URL = https://api.open-meteo.com/v1/forecast?latitude=51.5072&longitude=-0.1276&current_weather=true`.
5. Set `Refresh = 60` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Text`.
3. Set `Title = London Temp`.
4. Set `Header Text = London`.
5. Set `Unit Text = °C`.
6. Set `Precision = 1`.
7. Set `Size = Big`.
8. Set `Value Path = weatherLondon.current_weather.temperature`.
9. Save.

Expected output: current London temperature in Celsius.

## Example 2: BTC Price (CoinGecko)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = btcUsd`.
4. Set `URL = https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`.
5. Set `Refresh = 30` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Text`.
3. Set `Title = BTC Price`.
4. Set `Header Text = Bitcoin`.
5. Set `Unit Text = USD`.
6. Set `Precision = 0`.
7. Set `Animate Numeric Changes = true`.
8. Set `Value Path = btcUsd.bitcoin.usd`.
9. Save.

Expected output: live BTC/USD spot price.

