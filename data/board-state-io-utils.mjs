import { parseBoardSnapshot } from './board-state-utils.mjs';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function buildBoardSnapshotFilename(savedAt) {
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
