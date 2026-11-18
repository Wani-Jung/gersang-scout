import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';

// 백업/복원 대상 저장 키 전부. 화면 쪽 상수(app/(tabs)/index.tsx, app/samingeom.tsx)와 같은 값이어야 한다.
const KEY = {
  grid: '@gersang_grid_state_v8',
  header: '@gersang_header_state_v8',
  date: '@gersang_last_date_v8',
  history: '@gersang_history_v8',
  finalized: '@gersang_finalized_v8',
  order: '@gersang_col_order_v8',
  mission: '@gersang_mission_v8',
  swordRun: '@gersang_sword_run_v1', // 진행 중인 삼인검의 시작 시각(숫자)
  swordLog: '@gersang_sword_log_v1', // 삼인검 완료 기록 [{ at: 시각 }]
} as const;

export const BACKUP_KEYS: string[] = Object.values(KEY);
export const BACKUP_APP_ID = 'gersang-app';

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

// samingeom.tsx 의 완료 알림과 같은 값
const SWORD_NOTI_ID = 'sword-done';
const SWORD_DURATION_MS = 30 * 60 * 60 * 1000;

type BackupData = Record<string, unknown>;
export type ParsedBackup = { data: BackupData } | { error: string };

const two = (n: number) => String(n).padStart(2, '0');

/** 저장된 값을 글자(JSON) 하나로 묶는다. 날짜 키는 JSON이 아니라 글자 그대로 들어 있다. */
export async function buildBackupJson(): Promise<string> {
  const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
  const data: BackupData = {};
  for (const [k, v] of pairs) {
    if (v === null) continue;
    try {
      data[k] = JSON.parse(v);
    } catch {
      data[k] = v;
    }
  }
  return JSON.stringify({ app: BACKUP_APP_ID, version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

/** 백업 파일을 만들어 공유창으로 내보낸다 (파일 앱, 구글 드라이브, 카톡 등으로 저장). */
export async function exportBackupFile(): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('이 기기에서는 공유 기능을 쓸 수 없어요.');
  }
  const json = await buildBackupJson();
  const d = new Date();
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
  const file = new File(Paths.cache, `gersang-backup-${stamp}.json`);
  file.create({ overwrite: true });
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: '정탐배럭 백업 저장' });
}

/** 파일 선택창에서 백업 파일을 골라 글자로 읽어온다. 취소하면 null. */
export async function pickBackupText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (typeof asset.size === 'number' && asset.size > MAX_BACKUP_BYTES) {
    throw new Error('파일이 너무 커요. 정탐배럭 백업 파일이 맞는지 확인해 주세요.');
  }
  return await new File(asset.uri).text();
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** 읽어온 글자를 검사한다. 문제가 없으면 { data }, 있으면 { error }. */
export function parseBackup(text: string): ParsedBackup {
  let obj: unknown;
  try {
    obj = JSON.parse(String(text).trim());
  } catch {
    return { error: '백업 내용이 올바르지 않거나 중간에 잘렸어요.' };
  }
  if (!isPlainObject(obj) || obj.app !== BACKUP_APP_ID || !isPlainObject(obj.data)) {
    return { error: '정탐배럭 백업 파일이 아니에요.' };
  }
  const d = obj.data;
  const bad = { error: '백업 형식이 맞지 않아요.' };

  // 우리 앱 기록이 하나도 없는 백업을 불러오면 지금 기록만 지워지므로 막는다
  if (!BACKUP_KEYS.some((k) => k in d)) return { error: '백업에 기록이 들어 있지 않아요.' };

  for (const k of [KEY.grid, KEY.header, KEY.order, KEY.mission]) {
    if (k in d && !Array.isArray(d[k])) return bad;
  }
  if (KEY.history in d) {
    const h = d[KEY.history];
    if (!Array.isArray(h) || !h.every((it) => isPlainObject(it) && typeof it.date === 'string')) return bad;
  }
  if (KEY.finalized in d && typeof d[KEY.finalized] !== 'boolean') return bad;
  if (KEY.date in d) {
    const v = d[KEY.date];
    if (typeof v !== 'string' || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) return bad;
  }
  if (KEY.swordRun in d) {
    const v = d[KEY.swordRun];
    if (typeof v !== 'number' || !Number.isFinite(v)) return bad;
  }
  if (KEY.swordLog in d) {
    const v = d[KEY.swordLog];
    if (!Array.isArray(v) || !v.every((it) => isPlainObject(it) && typeof it.at === 'number' && Number.isFinite(it.at))) return bad;
  }
  return { data: d };
}

/** 불러오기 전에 보여줄 요약 */
export function summarizeBackup(d: BackupData) {
  const len = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0);
  return { days: len(KEY.history), runs: len(KEY.swordLog), running: typeof d[KEY.swordRun] === 'number' };
}

/** 진행 중인 삼인검이 있으면 완료 알림을 다시 건다 (samingeom.tsx 의 알림과 같은 내용) */
async function restoreSwordAlarm(d: BackupData) {
  try {
    await Notifications.cancelScheduledNotificationAsync(SWORD_NOTI_ID).catch(() => {});
    const run = d[KEY.swordRun];
    if (typeof run !== 'number') return;
    const endAt = run + SWORD_DURATION_MS;
    if (endAt <= Date.now()) return;
    await Notifications.scheduleNotificationAsync({
      identifier: SWORD_NOTI_ID,
      content: { title: '삼인검', body: '삼인검 임무가 끝났습니다. 보상을 받아가세요.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endAt) },
    });
  } catch (e) {
    console.log('삼인검 알림 복원 실패:', e);
  }
}

/** 검사를 통과한 백업으로 저장소를 통째로 바꾼다. 도중에 실패하면 원래 값으로 되돌린다. */
export async function applyBackup(d: BackupData): Promise<void> {
  const before = await AsyncStorage.multiGet(BACKUP_KEYS);
  try {
    await AsyncStorage.multiRemove(BACKUP_KEYS);
    const pairs: [string, string][] = BACKUP_KEYS
      .filter((k) => k in d)
      .map((k) => [k, k === KEY.date ? String(d[k]) : JSON.stringify(d[k])]);
    if (pairs.length) await AsyncStorage.multiSet(pairs);
  } catch (error) {
    try {
      await AsyncStorage.multiRemove(BACKUP_KEYS);
      const restore: [string, string][] = [];
      for (const [k, v] of before) if (v !== null) restore.push([k, v]);
      if (restore.length) await AsyncStorage.multiSet(restore);
    } catch (e2) {
      console.log('원복 실패:', e2);
    }
    throw error;
  }
  await restoreSwordAlarm(d);
}
