// Reference device client: sends measurements to the ingestion API exactly as a
// real sensor gateway would. Use it to test the pipeline before hardware exists.
//
//   node tools/device-client.mjs --url http://127.0.0.1:8080 --token lsd_… --cafe cafe_… --device sensor_001 \
//        --seats 30 --occupied 18 --noise 48 --wifi 82 [--every 60]
//
// Values are exactly what you pass (no randomness). Register the device as a *test*
// device in the admin dashboard while testing, so its data is labelled "ТУРШИЛТ"
// (test) on the website instead of being shown as a real live measurement.
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []));
for (const key of ['url', 'token', 'cafe', 'device']) if (!args[key]) { console.error(`Missing --${key}`); process.exit(1); }

const num = key => args[key] == null ? undefined : Number(args[key]);
function payload() {
  const total = num('seats'), occupied = num('occupied');
  return {
    schema_version: '1.0',
    cafe_id: args.cafe,
    device_id: args.device,
    timestamp: new Date().toISOString(),
    measurements: {
      ...(total != null ? { total_seats: total } : {}),
      ...(occupied != null ? { occupied_seats: occupied, ...(total != null ? { available_seats: total - occupied } : {}) } : {}),
      ...(num('noise') != null ? { noise_level_db: num('noise') } : {}),
      ...(num('wifi') != null ? { wifi_quality: num('wifi') } : {}),
      ...(num('mbps') != null ? { wifi_download_mbps: num('mbps') } : {})
    },
    device_status: { state: 'online', firmware: 'device-client/1.0' }
  };
}

async function send() {
  const body = payload();
  const response = await fetch(new URL('/api/v1/ingest/measurements', args.url), { method: 'POST', headers: { Authorization: `Bearer ${args.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  console.log(new Date().toISOString(), response.status, await response.text());
}

await send();
if (args.every) setInterval(send, Math.max(5, num('every')) * 1000);
