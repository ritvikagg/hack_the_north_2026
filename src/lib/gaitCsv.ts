import type { GaitCapture } from './gait';

/** Shared native-collector schema; relative timestamps are nanoseconds. */
export function gaitCaptureToCsv(capture: GaitCapture) {
  const header = 'session_id,label,t_ns,t_ms,sensor_timestamp_s,accel_x_mps2,accel_y_mps2,accel_z_mps2,linear_accel_x_mps2,linear_accel_y_mps2,linear_accel_z_mps2,gravity_x_mps2,gravity_y_mps2,gravity_z_mps2,gyro_x_rads,gyro_y_rads,gyro_z_rads,orientation_alpha,orientation_beta,orientation_gamma';
  const cell = (value: string | number) => typeof value === 'number'
    ? Number.isFinite(value) ? String(value) : ''
    : '"' + value.replace(/"/g, '""') + '"';
  const rows = capture.samples.map(sample => [capture.sessionId, capture.label,
    Math.round(sample.tMs * 1_000_000), sample.tMs, sample.sensorTimestampS,
    ...sample.accel, ...sample.linearAccel, ...sample.gravity, ...sample.gyro, ...sample.orientation,
  ].map(cell).join(','));
  return [header, ...rows].join('\n');
}
