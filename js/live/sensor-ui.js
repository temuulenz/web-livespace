import { sensorState } from './sensor-state.js';
import { html, raw } from '../../framework/index.js';

export const sensorStatusLabel = status => ({ online: 'Онлайн · online', stale: 'Хуучирсан · stale', offline: 'Офлайн · offline', disabled: 'Идэвхгүй · disabled' }[status] || 'Мэдээлэлгүй');
export const sensorSourceLabel = source => source === 'real' ? 'Бодит · REAL' : source === 'simulated' ? 'Туршилт · SIMULATED' : 'Гараар · MANUAL';
export const sensorTime = value => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Ulaanbaatar', hour12: false }) : '—';
export function noiseText(noise) {
  if (noise?.calibrated && noise.estimatedDbSpl != null) return `${Number(noise.estimatedDbSpl).toFixed(1)} dB SPL`;
  if (noise?.dbfs != null) return `${Number(noise.dbfs).toFixed(1)} dBFS`;
  return 'Хэмжилтгүй';
}
export function sensorPanelHTML(cafe, compact = false, options = {}) {
  const sensor = sensorState(cafe, options);
  if (!sensor) return '';
  return html`<div class="sensor-panel ${compact ? 'sensor-compact' : ''}" data-sensor-panel aria-live="polite">
    <div class="sensor-meta"><span class="badge ${sensor.dataSource === 'real' ? 'b-live' : 'b-typ'}" data-sensor-source="${sensor.dataSource}">${sensorSourceLabel(sensor.dataSource)}</span>
      <span data-sensor-status="${sensor.status}">${sensorStatusLabel(sensor.status)}</span></div>
    ${compact ? '' : html`<div class="sensor-values"><span>Ажиглагдсан хүмүүс <b class="num" data-observed-people>${sensor.observedPeople ?? '—'}</b>${sensor.peopleStale ? ' · хуучирсан' : ''}</span>
      <span>Дуу чимээ <b class="num" data-sensor-noise>${noiseText(sensor.noise)}</b>${sensor.noiseStale ? ' · хуучирсан' : ''}</span></div>`}
    <small>Шинэчлэгдсэн <time datetime="${sensor.timestamp}">${sensorTime(sensor.timestamp)}</time> · UTC+8</small>
    ${compact ? '' : html`<p class="muted">${sensor.confidence == null ? 'Итгэлцлийн үнэлгээ байхгүй' : `Камерын итгэлцэл ${Math.round(sensor.confidence * 100)}%`}. ${sensor.noise?.calibrated ? 'Калибровктой SPL үнэлгээ.' : 'Калибровкгүй dBFS нь бодит дууны даралт (SPL) биш.'} Хүний тоо нь сул суудлын тоо биш.${sensor.deviceCount > 1 ? ' Олон төхөөрөмжийн тоог нэмэхгүй; хамгийн сүүлийн ажиглалтыг харуулна.' : ''}</p>`}
  </div>`;
}
export function deviceDiagnosticsHTML(device) {
  const d = device.last_status || {};
  return html`<span class="sensor-diagnostics" data-device-diagnostics="${device.id}">
    <span>Батарей <b>${d.batteryPercent ?? d.battery_pct ?? '—'}%</b></span>
    <span>Температур <b>${d.batteryTemperatureC ?? '—'} °C</b></span>
    <span>Цэнэглэж байна: ${d.charging == null ? '—' : d.charging ? 'Тийм' : 'Үгүй'}</span>
    <span>Inference ${d.inferenceMs ?? '—'} ms · uptime ${d.uptimeSeconds ?? '—'} s</span>
  </span>`;
}
