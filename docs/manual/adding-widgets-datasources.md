# Adding Widgets & Datasources

## Simple Digital Clock

Start by adding a clock datasource and name it "clockSource", set it to be enabled, keep refresh rate at 2 second and hit ok.

In styling add:

```css
body {
  font-family: sans-serif;
  font-size: 24px;
  color: #2196f3;
  text-align: center;
}
```

In script add:

```js
window.addEventListener("message", (event) => {
  if (
    event.data?.type === "datasource:update" &&
    event.data.datasource === "clockSource"
  ) {
    const date = new Date(event.data.data); // 'data' is the Date from ClockDatasource
    const options = {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    const timeString = date.toLocaleTimeString("en-US", options);
    document.getElementById("time-display").innerText = timeString;
  }
});
```

In html put:

```html
<div id="time-display">Waiting for time...</div>
```

## Graphic Analog Clock

We will use the same datasource `clockSource`.

In style put:

```css
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clock {
  height: 90%;
  max-width: 180px;
  aspect-ratio: 1 / 1;
  /* Ensures perfect circle */
  border: 6px solid #333;
  border-radius: 50%;
  position: relative;
  background: white;
  box-sizing: border-box;
}

.hand {
  width: 50%;
  height: 2px;
  background: #333;
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: 0% 50%;
  /* Pivot from the center of the clock */
  transform: rotate(90deg);
}

.hand.hour {
  width: 35%;
  /* Shorter for hour hand */
  height: 4px;
  background: #000;
}

.hand.minute {
  width: 45%;
}

.hand.second {
  width: 50%;
  background: red;
}

.center {
  width: 10px;
  height: 10px;
  background: #000;
  border-radius: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
```

In script put:

```js
window.addEventListener("message", (event) => {
  if (event.data.type === "datasource:update") {
    const currentTime = new Date(event.data.data);
    const seconds = currentTime.getSeconds();
    const minutes = currentTime.getMinutes();
    const hours = currentTime.getHours();

    // Calculate angles, adjust for 12 o'clock
    const secondDeg = seconds * 6 - 90;
    const minuteDeg = minutes * 6 + seconds * 0.1 - 90;
    const hourDeg = (hours % 12) * 30 + minutes * 0.5 - 90;

    // Apply transforms
    document.querySelector(
      ".hand.second"
    ).style.transform = `rotate(${secondDeg}deg)`;
    document.querySelector(
      ".hand.minute"
    ).style.transform = `rotate(${minuteDeg}deg)`;
    document.querySelector(
      ".hand.hour"
    ).style.transform = `rotate(${hourDeg}deg)`;
  }
});
```

In html put:

```html
<div class="clock">
  <div class="hand hour" id="hour-hand"></div>
  <div class="hand minute" id="minute-hand"></div>
  <div class="hand second" id="second-hand"></div>
  <div class="center"></div>
</div>
```

## Random Fact JSON Source

Add a new JSON data source and enter:

Title: randomFact
Enabled: yes
url: https://uselessfacts.jsph.pl/api/v2/facts/random?language=en
Use proxy: yes
Refresh interval: 15 (seconds)

Now add the new midget, title it Random Fact and enable to yes. In style put:

```css
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #1e1e1e;
  /* Dark background */
  color: #fff;
  font-family: "Segoe UI", Tahoma, sans-serif;
}

.container {
  max-width: 90%;
  padding: 1rem 1.5rem;
  background: #2c2c2c;
  border-radius: 10px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
  text-align: center;
  animation: fadeIn 0.5s ease-out;
}

#factText {
  font-size: 1.2rem;
  line-height: 1.2;
  color: #ffeb3b;
  /* Accent color for the text */
  font-weight: 500;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

In script put:

```js
window.addEventListener("message", (event) => {
  if (
    event.data.type === "datasource:update" &&
    event.data.datasource === "randomFact"
  ) {
    const dto = event.data.data;
    const text = dto.text || JSON.stringify(dto);
    document.getElementById("factText").textContent = text;
  }
});
```

In html put:

```html
<div class="container">
  <p id="factText">Loading...</p>
</div>
```

## Current Temperature JSON Source

Add the json source:

Title: localTemp
Enabled: yes
URL: https://api.open-meteo.com/v1/forecast?latitude=42.9837&longitude=-81.2497&hourly=temperature_2m&current_weather=true
Use proxy: yes
Refresh interval: 60 seconds

Create a new widget title it Local Temp and enable to yes. In style put:

```css
html,
body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

#gauge {
    width: 160px;
    height: 160px;
}
```

In script put:

```js
const ctx = document.getElementById('gauge').getContext('2d');
const size = Math.min(ctx.canvas.width, ctx.canvas.height);
ctx.canvas.width = size;
ctx.canvas.height = size;

function drawGauge(temp) {
    const max = 50, min = -20;
    const pct = (temp - min) / (max - min);
    const angle = pct * Math.PI * 1.5 + Math.PI * 0.75;
    ctx.clearRect(0, 0, size, size);
    // background arc
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.4, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = size * 0.05; ctx.stroke();
    // filled arc
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.4, Math.PI * 0.75, angle);
    ctx.strokeStyle = temp >= 0 ? 'red' : 'blue'; ctx.lineWidth = size * 0.07; ctx.stroke();
    // needle
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.35, 0);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    document.getElementById('temp-label').innerText = temp.toFixed(1) + ' °C';
}

window.addEventListener('message', event => {
    if (event.data.type === 'datasource:update' && event.data.datasource === 'localTemp') {
        const temp = event.data.data.current_weather.temperature;
        drawGauge(temp);
    }
});
```

In html put:

```html
<canvas id="gauge"></canvas>
<div id="temp-label" style="text-align:center;font-size:2em;margin-top:-50px;"></div>
```