import type { Capture, IntentItem } from './model';
import { parseLocalTime } from './model';

export function reminderPhase(item: IntentItem, now: number) {
  if (item.state === 'completed') return 'completed';
  if (item.state === 'cancelled') return 'cancelled';
  if (!item.dueAt) return 'clarify';
  return item.dueAt <= now ? 'due' : 'scheduled';
}

// Resolve only a quoted calendar day relative to the recording, never the sync date.
export function reminderDay(capture: Capture, item: IntentItem): string {
  if (!capture.source.timeTrusted) return '';
  const value = item.dateText;
  const day = new Date(capture.source.capturedAt);
  const relative = value.match(/今天|明天|后天/);
  if (relative) {
    day.setDate(
      day.getDate() + ({ 今天: 0, 明天: 1, 后天: 2 }[relative[0]] ?? 0),
    );
  } else {
    const absolute = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (!absolute) return '';
    return absolute[0];
  }
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(day.getDate()).padStart(2, '0')}`;
}

export function confirmedReminderTime(value: string, now: number) {
  const timestamp = parseLocalTime(value.trim());
  if (timestamp <= now)
    throw new Error('这个时间已经过去，请确认新的日期和时间。');
  return timestamp;
}
