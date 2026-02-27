export type DurationUnit = 'ms' | 's' | 'm' | 'h' | 'd';
export type DurationString =
  | `${number} ${DurationUnit}`
  | `${number}${DurationUnit}`;
export type Duration = number | DurationString;

const UNIT_TO_MS: Record<DurationUnit, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};
const DURATION_REGEX = /^(\d+(?:\.\d+)?)\s?(ms|s|m|h|d)$/;

export function toMs(duration: Duration): number {
  if (typeof duration === 'number') {
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid duration: ${duration}`);
    }
    return duration;
  }

  const match = duration.trim().match(DURATION_REGEX);
  if (!match) {
    throw new Error(`Unable to parse duration: ${duration}`);
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2] as DurationUnit;
  const milliseconds = value * UNIT_TO_MS[unit];

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error(`Invalid duration: ${duration}`);
  }

  return milliseconds;
}
