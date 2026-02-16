import mqtt from "mqtt";

const brokerUrl = process.env.BROKER_URL || "mqtt://realtime-mqtt-broker:1883";
const topic = process.env.TOPIC || "factory/line1/status";
const intervalMs = Number(process.env.INTERVAL_MS || 1000);

const client = mqtt.connect(brokerUrl, {
  reconnectPeriod: 1000,
});

let sequence = 0;
let timer = null;

client.on("connect", () => {
  console.log(`MQTT publisher connected to ${brokerUrl}`);
  if (timer) {
    clearInterval(timer);
  }

  timer = setInterval(() => {
    sequence += 1;
    const payload = JSON.stringify({
      sequence,
      timestamp: new Date().toISOString(),
      metrics: {
        voltage: Number((12 + Math.sin(sequence / 7) * 0.4).toFixed(3)),
        current: Number((3 + Math.cos(sequence / 9) * 0.2).toFixed(3)),
      },
    });

    client.publish(topic, payload, { qos: 1 }, (error) => {
      if (error) {
        console.error("MQTT publish failed", error.message || error);
      }
    });
  }, intervalMs);
});

client.on("error", (error) => {
  console.error("MQTT publisher error", error.message || error);
});

const shutdown = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  client.end(true, () => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
