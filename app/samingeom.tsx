import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STORAGE_KEY = '@gersang_samin_v1';
const NOTI_ID = 'samin-done';

const DURATION_MS = 30 * 60 * 60 * 1000;  // 삼인검 임무 30시간

type Record = { id: string; startedAt: number; completedAt: number; manual?: boolean };
type Active = { startedAt: number } | null;
type Store = { active: Active; records: Record[] };

const EMPTY: Store = { active: null, records: [] };

const two = (n: number) => String(n).padStart(2, '0');

// 03:37:21
const formatClock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${two(Math.floor(t / 3600))}:${two(Math.floor((t % 3600) / 60))}:${two(t % 60)}`;
};

// 11/17 13:15
const formatShort = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ── 보상 아이콘 ─────────────────────────────────────────── */

function RubyIcon({ size = 44 }: { size?: number }) {
  const s = size * 0.72;
  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View style={{ width: s, height: s, borderRadius: s * 0.18, backgroundColor: '#e23b3b', transform: [{ rotate: '45deg' }] }}>
        <View style={{ position: 'absolute', top: s * 0.16, left: s * 0.16, width: s * 0.26, height: s * 0.26, borderRadius: s * 0.13, backgroundColor: '#ffd9d9' }} />
      </View>
    </View>
  );
}

function SlabIcon({ size = 44 }: { size?: number }) {
  const w = size * 0.6;
  const h = size * 0.74;
  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View style={{ width: w, height: h, borderRadius: w * 0.14, backgroundColor: '#9aa5b1', paddingTop: h * 0.18, alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: w * 0.52, height: Math.max(1.5, h * 0.07), borderRadius: 2, backgroundColor: '#e8edf2', marginBottom: h * 0.1 }} />
        ))}
      </View>
    </View>
  );
}

/* ── 화면 ────────────────────────────────────────────────── */

export default function SaminScreen() {
  const router = useRouter();
  const [store, setStore] = useState<Store>(EMPTY);
  const [now, setNow] = useState(Date.now());
  const [dialog, setDialog] = useState(false);
  const [draftStart, setDraftStart] = useState(Date.now());
  const tick = useRef<any>(null);

  useEffect(() => { load(); }, []);

  // 진행 중일 때만 1초마다 갱신
  useEffect(() => {
    if (tick.current) clearInterval(tick.current);
    if (store.active) {
      setNow(Date.now());
      tick.current = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [store.active]);

  const load = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setStore({
        active: parsed?.active?.startedAt ? { startedAt: parsed.active.startedAt } : null,
        records: Array.isArray(parsed?.records) ? parsed.records : [],
      });
    } catch (e) { console.log('삼인검 불러오기 실패:', e); }
  };

  const save = useCallback(async (next: Store) => {
    setStore(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const scheduleAlarm = async (endAt: number) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(NOTI_ID).catch(() => { });
      if (endAt <= Date.now()) return;
      await Notifications.scheduleNotificationAsync({
        identifier: NOTI_ID,
        content: { title: '삼인검', body: '삼인검 임무가 끝났습니다. 보상을 받아가세요.' },
        trigger: { type: 'date', date: new Date(endAt) } as any,
      });
    } catch (e) { console.log('삼인검 알림 실패:', e); }
  };

  const clearAlarm = async () => {
    try { await Notifications.cancelScheduledNotificationAsync(NOTI_ID); } catch { }
  };

  /* ── 동작 ── */

  const startNow = async () => {
    const at = Date.now();
    await save({ ...store, active: { startedAt: at } });
    await scheduleAlarm(at + DURATION_MS);
  };

  const cancelRun = () => {
    Alert.alert('타이머 취소', '진행 중인 임무를 취소할까요?\n(완료 기록은 남지 않아요)', [
      { text: '아니오', style: 'cancel' },
      {
        text: '취소하기', style: 'destructive',
        onPress: async () => { await save({ ...store, active: null }); await clearAlarm(); },
      },
    ]);
  };

  const completeRun = async () => {
    if (!store.active) return;
    const startedAt = store.active.startedAt;
    const rec: Record = { id: makeId(), startedAt, completedAt: startedAt + DURATION_MS };
    await save({ active: null, records: [...store.records, rec] });
    await clearAlarm();
  };

  const openDialog = () => {
    setDraftStart(store.active ? store.active.startedAt : Date.now());
    setDialog(true);
  };

  const shiftDraft = (ms: number) => setDraftStart((v) => v + ms);

  // 맞춘 시각이 아직 진행 중이면 타이머로, 이미 지났으면 완료 기록으로
  const submitDialog = async () => {
    const endAt = draftStart + DURATION_MS;
    setDialog(false);
    if (endAt > Date.now()) {
      await save({ ...store, active: { startedAt: draftStart } });
      await scheduleAlarm(endAt);
    } else {
      const rec: Record = { id: makeId(), startedAt: draftStart, completedAt: endAt, manual: true };
      const next = [...store.records, rec].sort((a, b) => a.completedAt - b.completedAt);
      await save({ ...store, records: next });
    }
  };

  const removeRecord = (id: string) => {
    Alert.alert('기록 삭제', '이 기록을 지울까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => { await save({ ...store, records: store.records.filter((r) => r.id !== id) }); },
      },
    ]);
  };

  /* ── 계산 ── */

  const count = store.records.length;
  const endAt = store.active ? store.active.startedAt + DURATION_MS : 0;
  const remain = endAt - now;
  const isDone = !!store.active && remain <= 0;
  const progress = store.active ? Math.min(1, Math.max(0, (now - store.active.startedAt) / DURATION_MS)) : 0;

  const listed = [...store.records].sort((a, b) => b.completedAt - a.completedAt);
  const indexOf = (r: Record) => store.records.findIndex((x) => x.id === r.id) + 1;

  const draftEnd = draftStart + DURATION_MS;
  const draftRunning = draftEnd > Date.now();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>⚔️ 삼인검 기록</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* 임무 진행 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>임무 진행</Text>

          {store.active ? (
            <>
              {isDone ? (
                <Text style={styles.doneBig}>완료 가능</Text>
              ) : (
                <>
                  <Text style={styles.clock}>{formatClock(remain)}</Text>
                  <Text style={styles.clockCaption}>남은 시간</Text>
                </>
              )}

              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>

              <Text style={styles.runLine}>시작 {formatShort(store.active.startedAt)}</Text>
              <Text style={styles.runLine}>완료 예정 {formatShort(endAt)}</Text>

              {isDone && (
                <Pressable style={styles.primaryBtn} onPress={completeRun}>
                  <Text style={styles.primaryBtnText}>완료 기록하기</Text>
                </Pressable>
              )}

              <Pressable onPress={cancelRun} style={styles.linkRow}>
                <Text style={styles.linkDanger}>타이머 취소</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.idleText}>진행 중인 임무가 없어요</Text>
              <Pressable style={styles.primaryBtn} onPress={startNow}>
                <Text style={styles.primaryBtnText}>지금 시작</Text>
              </Pressable>
            </>
          )}

          <Pressable onPress={openDialog} style={styles.linkRow}>
            <Text style={styles.linkPrimary}>이미 시작한 임무 기록하기</Text>
          </Pressable>
        </View>

        {/* 누적 보상 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>누적 보상</Text>

          <View style={styles.rewardRow}>
            <View style={styles.rewardItem}>
              <RubyIcon size={46} />
              <View style={styles.rewardTexts}>
                <Text style={styles.rewardName}>홍옥상자</Text>
                <Text style={styles.rewardCount}>×{count}</Text>
              </View>
            </View>
            <View style={styles.rewardItem}>
              <SlabIcon size={46} />
              <View style={styles.rewardTexts}>
                <Text style={styles.rewardName}>석판상자</Text>
                <Text style={[styles.rewardCount, { color: '#4b5563' }]}>×{count}</Text>
              </View>
            </View>
          </View>

          {count > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.chipWrap}>
                {store.records.map((r) => (
                  <View key={r.id} style={styles.chip}>
                    <RubyIcon size={26} />
                    <SlabIcon size={26} />
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* 기록 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>기록 ({count}회)</Text>

          {store.active && (
            <View style={styles.logRow}>
              <View style={styles.badge}><Text style={styles.badgeText}>진행중</Text></View>
              <Text style={styles.logRange}>
                {formatShort(store.active.startedAt)} ~ {formatShort(endAt)}
              </Text>
            </View>
          )}

          {count === 0 && !store.active && <Text style={styles.empty}>아직 기록이 없어요</Text>}

          {listed.map((r) => (
            <View key={r.id} style={styles.logRow}>
              <Text style={styles.logText}>
                <Text style={styles.logNo}>{indexOf(r)}회차</Text>
                {'  ·  '}
                {formatShort(r.startedAt)} ~ {formatShort(r.completedAt)}
              </Text>
              <Pressable onPress={() => removeRecord(r.id)} hitSlop={12}>
                <Text style={styles.del}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* 지난 기록 추가 */}
      <Modal visible={dialog} transparent animationType="fade" onRequestClose={() => setDialog(false)}>
        <View style={styles.dim}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>지난 기록 추가</Text>
            <Text style={styles.sheetSub}>임무를 시작한 시각을 맞춰주세요</Text>
            <Text style={styles.sheetSub}>종료는 30시간 뒤로 자동 계산돼요</Text>

            <Text style={styles.draftRange}>
              {formatShort(draftStart)} ~ {formatShort(draftEnd)}
            </Text>
            <Text style={draftRunning ? styles.draftRunning : styles.draftFinished}>
              {draftRunning ? '⌛ 아직 진행 중이에요 · 타이머가 이어서 돌아가요' : '✅ 이미 끝난 임무 · 완료 기록으로 들어가요'}
            </Text>

            {[
              { label: '1일', ms: 24 * 60 * 60 * 1000 },
              { label: '1시간', ms: 60 * 60 * 1000 },
              { label: '10분', ms: 10 * 60 * 1000 },
            ].map((step) => (
              <View key={step.label} style={styles.stepRow}>
                <Pressable style={styles.stepBtn} onPress={() => shiftDraft(-step.ms)}>
                  <Text style={styles.stepText}>‹ {step.label}</Text>
                </Pressable>
                <Pressable style={styles.stepBtn} onPress={() => shiftDraft(step.ms)}>
                  <Text style={styles.stepText}>{step.label} ›</Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.shortcutRow}>
              <Pressable onPress={() => setDraftStart(Date.now())}>
                <Text style={styles.linkPrimary}>지금 시작</Text>
              </Pressable>
              <Pressable onPress={() => setDraftStart(Date.now() - DURATION_MS)}>
                <Text style={styles.linkPrimary}>방금 끝난 임무로</Text>
              </Pressable>
            </View>

            <View style={styles.sheetButtons}>
              <Pressable style={styles.ghostBtn} onPress={() => setDialog(false)}>
                <Text style={styles.ghostBtnText}>취소</Text>
              </Pressable>
              <Pressable style={styles.primaryBtnWide} onPress={submitDialog}>
                <Text style={styles.primaryBtnText}>기록 추가</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const PURPLE = '#6c5ce7';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f5f7fa' },
  backBtn: { minWidth: 64 },
  backText: { color: PURPLE, fontSize: 17, fontWeight: 'bold' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },

  content: { padding: 16, paddingBottom: 30 },

  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, marginBottom: 16, elevation: 2 },
  cardLabel: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },

  clock: { fontSize: 46, fontWeight: '900', color: '#1f2937', textAlign: 'center', marginTop: 18, letterSpacing: 1 },
  clockCaption: { fontSize: 15, color: '#9aa5b1', textAlign: 'center', marginTop: 6 },
  doneBig: { fontSize: 32, fontWeight: '900', color: '#2d9c5a', textAlign: 'center', marginTop: 20 },
  idleText: { fontSize: 16, color: '#9aa5b1', textAlign: 'center', marginTop: 22 },

  barTrack: { height: 10, borderRadius: 5, backgroundColor: '#eceff3', marginTop: 20, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: PURPLE },

  runLine: { fontSize: 15, color: '#8b96a5', textAlign: 'center', marginTop: 10 },

  primaryBtn: { backgroundColor: PURPLE, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  primaryBtnWide: { flex: 1, backgroundColor: PURPLE, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  linkRow: { paddingVertical: 14, alignItems: 'center' },
  linkDanger: { color: '#e74c3c', fontWeight: 'bold', fontSize: 16 },
  linkPrimary: { color: PURPLE, fontWeight: 'bold', fontSize: 16 },

  iconBox: { alignItems: 'center', justifyContent: 'center' },

  rewardRow: { flexDirection: 'row', marginTop: 18 },
  rewardItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rewardTexts: { marginLeft: 10 },
  rewardName: { fontSize: 14, color: '#6b7280', fontWeight: 'bold' },
  rewardCount: { fontSize: 26, fontWeight: '900', color: '#1f2937', marginTop: 2 },

  divider: { height: 1, backgroundColor: '#eef1f4', marginTop: 20, marginBottom: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f6f9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 5, margin: 4 },

  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f1f3f6' },
  logText: { fontSize: 15, color: '#4b5563' },
  logNo: { fontWeight: 'bold', color: '#1f2937' },
  logRange: { fontSize: 15, color: '#4b5563' },
  badge: { backgroundColor: PURPLE, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  del: { fontSize: 17, color: '#cfd6dd', fontWeight: 'bold', paddingLeft: 10 },
  empty: { color: '#b9c0c8', textAlign: 'center', paddingVertical: 18 },

  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 22 },
  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 22 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
  sheetSub: { fontSize: 14, color: '#9aa5b1', textAlign: 'center', marginTop: 6 },
  draftRange: { fontSize: 20, fontWeight: '900', color: PURPLE, textAlign: 'center', marginTop: 18 },
  draftRunning: { fontSize: 13, color: '#e17055', textAlign: 'center', marginTop: 8, fontWeight: 'bold' },
  draftFinished: { fontSize: 13, color: '#2d9c5a', textAlign: 'center', marginTop: 8, fontWeight: 'bold' },

  stepRow: { flexDirection: 'row', marginTop: 12 },
  stepBtn: { flex: 1, backgroundColor: '#f1f3f7', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginHorizontal: 5 },
  stepText: { fontSize: 16, fontWeight: 'bold', color: '#374151' },

  shortcutRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 20 },

  sheetButtons: { flexDirection: 'row', marginTop: 18 },
  ghostBtn: { flex: 1, backgroundColor: '#f1f3f7', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginRight: 10 },
  ghostBtnText: { color: '#6b7280', fontWeight: 'bold', fontSize: 16 },
});
