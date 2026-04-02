import { parseBoardSnapshot } from './board-state-utils.mjs';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function buildBoardSnapshotFilename(savedAt) {
  if (typeof savedAt === 'string') {
    const match = savedAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hours, minutes] = match;
      return `drowvtt-board-save-${year}${month}${day}-${hours}${minutes}.json`;
    }
  }
  const stamp = new Date(savedAt || Date.now());
  if (Number.isNaN(stamp.getTime())) return 'drowvtt-board-save.json';
  const year = stamp.getFullYear();
  const month = pad(stamp.getMonth() + 1);
  const day = pad(stamp.getDate());
  const hours = pad(stamp.getHours());
  const minutes = pad(stamp.getMinutes());
  return `drowvtt-board-save-${year}${month}${day}-${hours}${minutes}.json`;
}

export function parseBoardSnapshotText(text) {
  const parsed = JSON.parse(text);
  return parseBoardSnapshot(parsed);
}
