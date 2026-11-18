import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';

// 백업/복원 대상 저장 키. 화면 쪽 상수(app/(tabs)/index.tsx, app/samingeom.tsx)와 같은 값이어야 한다.
// ※ 화면에서 저장 키를 바꾸거나 새로 만들면 여기도 같이 고치고, 옛 키의 기록을 옮기는 코드(아래 migrate...)를 둔다.
//   안 그러면 백업에서 빠지거나, 업데이트 뒤 기록이 사라진 것처럼 보인다.
const KEY = {
  grid: '@gersang_grid_state_v8',
  header: '@gersang_header_state_v8',
  date: '@gersang_last_date_v8',
  history: '@gersang_history_v8',
  finalized: '@gersang_finalized_v8',
  order: '@gersang_col_order_v8',
  mission: '@gersang_mission_v8',
  login: '@gersang_login_v1', // 접속 체크 (app/(tabs)/index.tsx)
  samin: '@gersang_samin_v1', // 삼인검 { active, records } (app/samingeom.tsx)
} as const;

// v1.1.0 까지 쓰던 삼인검 저장 키. 지금 화면은 읽지 않으므로 samin 으로 옮겨야 한다.
const LEGACY = {
  swordRun: '@gersang_sword_run_v1', // 진행 중인 삼인검의 시작 시각(숫자)
  swordLog: '@gersang_sword_log_v1', // 완료 기록 [{ at: 완료 시각, startedAt?: 시작 시각 }]
} as const;

/** 내보내기 대상 (현재 키) */
export const BACKUP_KEYS: string[] = Object.values(KEY);
const LEGACY_KEYS: string[] = Object.values(LEGACY);
/** 지우기·되돌리기·검사 대상 (현재 키 + 옛 키) */
const ALL_KEYS: string[] = [...BACKUP_KEYS, ...LEGACY_KEYS];

export const BACKUP_APP_ID = 'gersang-app';
// 예전 앱(jeongtam-barrack)의 백업도 저장 형식이 같아서 그대로 받는다.
const ACCEPTED_APP_IDS = [BACKUP_APP_ID, 'jeongtam-barrack'];

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

const SAMIN_DURATION_MS = 30 * 60 * 60 * 1000; // samingeom.tsx 의 DURATION_MS 와 같은 값
const SAMIN_NOTI_ID = 'samin-done'; // samingeom.tsx 의 NOTI_ID 와 같은 값
const LEGACY_NOTI_ID = 'sword-done'; // v1.1.0 까지 쓰던 알림 id

type BackupData = Record<string, unknown>;
export type ParsedBackup = { data: BackupData } | { error: string };

// 임무 종류: 'sam' 삼인검, 'sa' 사인검. 값이 없으면(예전 기록) 삼인검으로 본다. (app/samingeom.tsx 의 Kind 와 같은 값)
type SaminKind = 'sam' | 'sa';
type SaminRecord = { id: string; startedAt: number; completedAt: number; manual?: boolean; kind?: SaminKind };
type SaminStore = { active: { startedAt: number; kind?: SaminKind } | null; records: SaminRecord[] };

const isKind = (v: unknown): v is SaminKind => v === 'sam' || v === 'sa';

const two = (n: number) => String(n).padStart(2, '0');

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 삼인검 값을 검사하고 정리한다. 형식이 맞지 않으면 null. 완료 기록에 id 가 없으면 만들어 준다. */
function normalizeSamin(v: unknown): SaminStore | null {
  if (!isPlainObject(v) || !Array.isArray(v.records)) return null;

  let active: SaminStore['active'] = null;
  if (v.active !== null && v.active !== undefined) {
    if (!isPlainObject(v.active) || !isNum(v.active.startedAt)) return null;
    active = { startedAt: v.active.startedAt, ...(isKind(v.active.kind) ? { kind: v.active.kind } : {}) };
  }

  const records: SaminRecord[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < v.records.length; i++) {
    const r: unknown = v.records[i];
    if (!isPlainObject(r) || !isNum(r.startedAt) || !isNum(r.completedAt)) return null;
    let id = typeof r.id === 'string' && r.id ? r.id : `rec-${r.completedAt}-${i}`;
    while (seen.has(id)) id += '_';
    seen.add(id);
    records.push({
      id,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      ...(r.manual === true ? { manual: true } : {}),
      ...(isKind(r.kind) ? { kind: r.kind } : {}),
    });
  }
  return { active, records };
}

/** v1.1.0 까지의 삼인검 값(sword_run / sword_log)을 지금 화면의 형식으로 바꾼다. */
function legacyToSamin(run: unknown, log: unknown): SaminStore {
  const records: SaminRecord[] = [];
  if (Array.isArray(log)) {
    log.forEach((it: unknown, i: number) => {
      if (!isPlainObject(it) || !isNum(it.at)) return;
      const known = isNum(it.startedAt);
      records.push({
        id: `legacy-${it.at}-${i}`,
        startedAt: known ? (it.startedAt as number) : it.at - SAMIN_DURATION_MS,
        completedAt: it.at,
        // 옛 화면은 완료 시각만 저장했으므로, 시작 시각을 모르면 추정한 값이라는 표시를 남긴다
        ...(known ? {} : { manual: true }),
      });
    });
  }
  records.sort((a, b) => a.completedAt - b.completedAt);
  return { active: isNum(run) ? { startedAt: run } : null, records };
}

/** 저장소의 삼인검 값을 읽는다. 새 키가 있으면 그것, 없으면 옛 키를 바꿔서. 둘 다 없으면 undefined. */
function readSaminFromPairs(pairs: readonly (readonly [string, string | null])[]): SaminStore | undefined {
  const m = new Map(pairs);
  const parse = (s: string | null | undefined): unknown => {
    if (s === null || s === undefined) return null;
    try { return JSON.parse(s); } catch { return null; }
  };
  const cur = m.get(KEY.samin);
  if (cur !== null && cur !== undefined) return normalizeSamin(parse(cur)) ?? undefined;
  const run = m.get(LEGACY.swordRun);
  const log = m.get(LEGACY.swordLog);
  if ((run === null || run === undefined) && (log === null || log === undefined)) return undefined;
  return legacyToSamin(parse(run), parse(log));
}

/** 저장된 값을 글자(JSON) 하나로 묶는다. 날짜 키는 JSON이 아니라 글자 그대로 들어 있다. */
export async function buildBackupJson(): Promise<string> {
  const pairs = await AsyncStorage.multiGet(ALL_KEYS);
  const data: BackupData = {};
  for (const [k, v] of pairs) {
    if (v === null || !BACKUP_KEYS.includes(k) || k === KEY.samin) continue;
    try {
      data[k] = JSON.parse(v);
    } catch {
      data[k] = v;
    }
  }
  const samin = readSaminFromPairs(pairs);
  if (samin) data[KEY.samin] = samin;
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

/**
 * 읽어온 글자를 검사하고 지금 형식으로 정리한다. 문제가 없으면 { data }, 있으면 { error }.
 * 돌려주는 data 에는 현재 키만 들어 있다 (옛 삼인검 키는 samin 으로 바뀌어 있다).
 */
export function parseBackup(text: string): ParsedBackup {
  // 메신저로 보낸 글자는 "정탐배럭 백업 - {...}" 처럼 앞에 제목이 붙을 수 있어서, 첫 '{' 부터 읽는다.
  const s = String(text);
  const start = s.indexOf('{');
  let obj: unknown;
  try {
    obj = JSON.parse(start < 0 ? s.trim() : s.slice(start).trim());
  } catch {
    return { error: '백업 내용이 올바르지 않거나 중간에 잘렸어요.' };
  }
  if (!isPlainObject(obj) || typeof obj.app !== 'string' || !ACCEPTED_APP_IDS.includes(obj.app) || !isPlainObject(obj.data)) {
    return { error: '정탐배럭 백업 파일이 아니에요.' };
  }
  const d = obj.data;
  const bad = { error: '백업 형식이 맞지 않아요.' };

  // 우리 앱 기록이 하나도 없는 백업을 불러오면 지금 기록만 지워지므로 막는다
  if (!ALL_KEYS.some((k) => k in d)) return { error: '백업에 기록이 들어 있지 않아요.' };

  for (const k of [KEY.grid, KEY.header, KEY.order, KEY.mission, KEY.login]) {
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

  const out: BackupData = {};
  for (const k of BACKUP_KEYS) {
    if (k !== KEY.samin && k in d) out[k] = d[k];
  }

  // 삼인검: 새 키가 있으면 그것을 쓰고, 없으면 옛 키(sword_*)를 새 형식으로 바꾼다
  if (KEY.samin in d) {
    const n = normalizeSamin(d[KEY.samin]);
    if (!n) return bad;
    out[KEY.samin] = n;
  } else if (LEGACY.swordRun in d || LEGACY.swordLog in d) {
    if (LEGACY.swordRun in d && !isNum(d[LEGACY.swordRun])) return bad;
    if (LEGACY.swordLog in d) {
      const v = d[LEGACY.swordLog];
      if (!Array.isArray(v) || !v.every((it) => isPlainObject(it) && isNum(it.at))) return bad;
    }
    out[KEY.samin] = legacyToSamin(d[LEGACY.swordRun], d[LEGACY.swordLog]);
  }
  return { data: out };
}

/** 불러오기 전에 보여줄 요약 (parseBackup 이 돌려준 data 기준) */
export function summarizeBackup(d: BackupData) {
  const h = d[KEY.history];
  const s = d[KEY.samin] as SaminStore | undefined;
  const sa = s ? s.records.filter((r) => r.kind === 'sa').length : 0;
  const total = s ? s.records.length : 0;
  return {
    days: Array.isArray(h) ? h.length : 0,
    runs: total, // 삼인검 + 사인검
    sam: total - sa, // 종류가 없는 예전 기록은 삼인검
    sa,
    running: !!s && s.active !== null,
  };
}

/** 진행 중인 삼인검이 있으면 완료 알림을 (다시) 건다. 옛 알림은 지운다. */
async function restoreSaminAlarm(store: SaminStore | undefined) {
  try {
    await Notifications.cancelScheduledNotificationAsync(LEGACY_NOTI_ID).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(SAMIN_NOTI_ID).catch(() => {});
    if (!store || !store.active) return;
    const endAt = store.active.startedAt + SAMIN_DURATION_MS;
    if (endAt <= Date.now()) return;
    const label = store.active.kind === 'sa' ? '사인검' : '삼인검'; // samingeom.tsx 의 알림 문구와 같게
    await Notifications.scheduleNotificationAsync({
      identifier: SAMIN_NOTI_ID,
      content: { title: label, body: `${label} 임무가 끝났습니다. 보상을 받아가세요.` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endAt) },
    });
  } catch (e) {
    console.log('삼인검 알림 복원 실패:', e);
  }
}

/**
 * v1.1.0 까지의 삼인검 기록(sword_*)을 새 키(samin)로 한 번 옮긴다. 앱을 켤 때 호출한다.
 * 새 키가 이미 있으면 아무것도 하지 않고, 옛 키는 지우지 않는다(안전을 위해 남겨 둠).
 * 옮겼으면 true.
 */
export async function migrateLegacySamin(): Promise<boolean> {
  try {
    const pairs = await AsyncStorage.multiGet([KEY.samin, LEGACY.swordRun, LEGACY.swordLog]);
    if (pairs[0][1] !== null) return false; // 새 형식이 이미 있다
    const store = readSaminFromPairs(pairs);
    if (!store) return false; // 옮길 게 없다
    await AsyncStorage.setItem(KEY.samin, JSON.stringify(store));
    await restoreSaminAlarm(store);
    return true;
  } catch (e) {
    console.log('삼인검 기록 옮기기 실패:', e);
    return false;
  }
}

/** 검사를 통과한 백업으로 저장소를 통째로 바꾼다. 도중에 실패하면 원래 값으로 되돌린다. */
export async function applyBackup(d: BackupData): Promise<void> {
  const before = await AsyncStorage.multiGet(ALL_KEYS);
  try {
    await AsyncStorage.multiRemove(ALL_KEYS);
    const pairs: [string, string][] = BACKUP_KEYS
      .filter((k) => k in d)
      .map((k) => [k, k === KEY.date ? String(d[k]) : JSON.stringify(d[k])]);
    if (pairs.length) await AsyncStorage.multiSet(pairs);
  } catch (error) {
    try {
      await AsyncStorage.multiRemove(ALL_KEYS);
      const restore: [string, string][] = [];
      for (const [k, v] of before) if (v !== null) restore.push([k, v]);
      if (restore.length) await AsyncStorage.multiSet(restore);
    } catch (e2) {
      console.log('원복 실패:', e2);
    }
    throw error;
  }
  await restoreSaminAlarm(d[KEY.samin] as SaminStore | undefined);
}
