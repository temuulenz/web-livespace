import { Component, html, raw } from '../../../framework/index.js';
import { sensorState, relativeNoise, rollingNoise, noiseThresholds } from '../../live/sensor-state.js';
import { sensorTime, sensorSourceLabel } from '../../live/sensor-ui.js';

// Uses the same cafe snapshot as the count and Canvas. Only the chart samples are local.
export class LiveNoise extends Component {
  initialState() { return { thresholds: null }; }
  events() {
    return { 'change [data-noise-threshold]': () => {
      const values = this.$$('[data-noise-threshold]').map(input => Number(input.value));
      const valid = values.every((n, i) => Number.isFinite(n) && n > -160 && n < 0 && (!i || n > values[i - 1]));
      this.$('[data-noise-config-error]').textContent = valid ? '' : 'Босго утгууд −160…0 хооронд өсөх дарааллаар байна.';
      if (valid) this.setState({ thresholds: values });
    } };
  }
  render() {
    const { cafe, staleAfterSec = 30, thresholds: configured } = this.props;
    const sensor = sensorState(cafe, { staleAfterSec });
    const source = sensor?.dataSource || (cafe.live?.mode === 'test' ? 'simulated' : 'real');
    const key = `${cafe.id}:${source}`;
    if (this.seriesKey !== key) { this.seriesKey = key; this.points = []; }
    this.points = rollingNoise(this.points || [], sensor);
    const thresholds = noiseThresholds(this.state.thresholds || configured);
    const relative = relativeNoise(sensor?.noise.dbfs, thresholds);
    const now = Date.now(), start = now - 300000;
    const points = this.points.map(p => `${((p.at - start) / 300000 * 280).toFixed(1)},${(72 - (p.dbfs + 160) / 160 * 64).toFixed(1)}`);
    const segments = [];
    this.points.forEach((p, i) => {
      if (!i || p.at - this.points[i - 1].at > staleAfterSec * 1000) segments.push([]);
      segments.at(-1).push(points[i]);
    });
    // Preserve the original HTTP SPL measurement without pretending it is dBFS
    // or inventing a calibration assertion that the legacy API never supplied.
    const legacySpl = !cafe.live?.sensor && !cafe.live?.stale && Date.now() - Date.parse(cafe.live?.updated_at) <= 900000 && Number.isFinite(cafe.live?.noise_db) ? cafe.live.noise_db : null;
    const time = sensor?.noiseTimestamp || (legacySpl != null ? cafe.live.updated_at : null);
    return html`<div class="live-noise" data-live-noise>
      <div class="sensor-meta"><span class="badge ${source === 'real' ? 'b-live' : 'b-typ'}">${sensorSourceLabel(source)}</span><span aria-hidden="true">♫</span></div>
      <div class="noise-reading"><b class="num" data-live-dbfs>${sensor?.noise.dbfs == null ? '—' : sensor.noise.dbfs.toFixed(1)}</b> dBFS</div>
      <p data-noise-category>${relative ? `Харьцангуй түвшин: ${relative.label} · ${relative.level}/5` : 'Микрофоны шинэ хэмжилт алга · unknown'}</p>
      <div class="noise-meter" role="meter" aria-label="Харьцангуй микрофоны түвшин, dBFS" aria-valuemin="-160" aria-valuemax="0" ${raw(relative ? `aria-valuenow="${sensor.noise.dbfs}"` : 'aria-valuetext="Мэдээлэлгүй"')}><i style="width:${relative?.percent ?? 0}%"></i></div>
      <p data-noise-calibration>${legacySpl != null ? 'Legacy HTTP · калибровкийн төлөв ирээгүй' : sensor?.noise.calibrated ? 'Калибровктой · calibrated' : 'Калибровкгүй · uncalibrated'}</p>
      ${legacySpl != null ? html`<p data-live-spl>HTTP хэмжилт: <b>${legacySpl.toFixed(1)} dB SPL</b></p>` : ''}
      ${sensor?.noise.estimatedDbSpl != null ? html`<p data-live-spl>Тусдаа калибровктой үнэлгээ: <b>${sensor.noise.estimatedDbSpl.toFixed(1)} dB SPL</b></p>` : ''}
      <small>Сүүлийн дууны хэмжилт: <time data-noise-time datetime="${time || ''}">${sensorTime(time)}</time>${sensor?.noiseStale ? ' · хуучирсан / unavailable' : ''}</small>
      <svg class="noise-history" viewBox="0 0 280 84" role="img" aria-label="Сүүлийн 5 минутын бодит микрофоны dBFS түүх" data-noise-chart data-samples="${this.points.length}">
        <path d="M0 8H280 M0 72H280" class="noise-grid"></path>
        ${segments.map(segment => html`<polyline points="${segment.join(' ')}"></polyline>`)}
        ${this.points.map((p, i) => html`<circle cx="${points[i].split(',')[0]}" cy="${points[i].split(',')[1]}" r="2"><title>${sensorTime(new Date(p.at).toISOString())}: ${p.dbfs.toFixed(1)} dBFS</title></circle>`)}
      </svg>
      <small>−160…0 dBFS · сүүлийн 5 минут · энэ хуудсыг нээснээс хойш ${this.points.length} бодит сорьц. Завсарт утга зохиохгүй.</small>
      <details data-preserve><summary>Харьцангуй босго тохируулах</summary><p class="muted">Эдгээр нь жишээ босго; микрофон, gain, төхөөрөмжөөс хамаарна. Орчны dB SPL биш. Энэ хуудсанд үйлчилнэ.</p>
        <div class="noise-thresholds">${thresholds.map((n, i) => html`<label>${i + 1} → ${i + 2}<input data-noise-threshold type="number" min="-159" max="-1" step="1" value="${n}" aria-label="${i + 1}-р dBFS босго"></label>`)}</div><small role="alert" data-noise-config-error></small>
      </details>
    </div>`;
  }
}
