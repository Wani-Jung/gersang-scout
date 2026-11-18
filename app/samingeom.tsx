import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STORAGE_KEY = '@gersang_samin_v1';
const NOTI_ID = 'samin-done';

const DURATION_MS = 30 * 60 * 60 * 1000;  // 임무 30시간 (삼인검·사인검 모두 같다고 보고 한 값을 쓴다)

// 임무 종류. 저장된 값에 kind 가 없으면(예전 기록) 삼인검으로 본다. lib/backup.ts 의 SaminKind 와 같은 값.
type Kind = 'sam' | 'sa';
const KIND_LIST: Kind[] = ['sam', 'sa'];
const KINDS: { [K in Kind]: { label: string; short: string; color: string } } = {
  sam: { label: '삼인검', short: '삼', color: '#6c5ce7' },
  sa: { label: '사인검', short: '사', color: '#e17055' },
};
const kindOf = (k?: Kind): Kind => (k === 'sa' ? 'sa' : 'sam');

// 임무 1회 완료당 받는 보상. per 는 1회에 받는 개수.
//   삼인검: 홍옥상자 1 + 석판상자 1
//   사인검: 청옥 조각 5 + 별자리 상자(水) 1
type RewardId = 'ruby' | 'slab' | 'jade' | 'star';
const REWARDS: { [K in Kind]: { id: RewardId; name: string; per: number; color: string }[] } = {
  sam: [
    { id: 'ruby', name: '홍옥상자', per: 1, color: '#d63c3c' },
    { id: 'slab', name: '석판상자', per: 1, color: '#6b7280' },
  ],
  sa: [
    { id: 'jade', name: '청옥 조각', per: 5, color: '#2f5bd2' },
    { id: 'star', name: '별자리 상자(水)', per: 1, color: '#374151' },
  ],
};

type Record = { id: string; startedAt: number; completedAt: number; manual?: boolean; kind?: Kind };
type Active = { startedAt: number; kind?: Kind } | null;
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

// 홍옥상자: 빨간 보석
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

// 석판상자: 돌 상자 (뚜껑 + 금빛 걸쇠)
function SlabIcon({ size = 44 }: { size?: number }) {
  const w = size * 0.88;
  const h = size * 0.68;
  const lid = h * 0.4;
  const b = Math.max(1, size * 0.04);
  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View style={{ width: w, height: h, borderRadius: size * 0.12, backgroundColor: '#8f9aa8', borderWidth: b, borderColor: '#4b5563', overflow: 'hidden' }}>
        <View style={{ height: lid, backgroundColor: '#b9c2cd', borderBottomWidth: b, borderBottomColor: '#4b5563' }} />
        <View style={{ position: 'absolute', top: lid - size * 0.08, left: w / 2 - b - size * 0.1, width: size * 0.2, height: size * 0.22, borderRadius: size * 0.05, backgroundColor: '#f2c94c', borderWidth: b, borderColor: '#9a7b12' }} />
      </View>
    </View>
  );
}

// 청옥 조각: 뾰족하게 깨진 푸른 보석 파편 5개 (삼각형을 테두리 기법으로 그린다)
function JadeIcon({ size = 44 }: { size?: number }) {
  const shards = [
    { l: 0.08, t: 0.34, w: 0.34, h: 0.46, r: '-20deg', c: '#2f58cf' },
    { l: 0.40, t: 0.10, w: 0.30, h: 0.42, r: '16deg', c: '#23408f' },
    { l: 0.52, t: 0.46, w: 0.30, h: 0.34, r: '-35deg', c: '#4d7cf2' },
    { l: 0.26, t: 0.58, w: 0.22, h: 0.26, r: '28deg', c: '#6f9bff' },
    { l: 0.62, t: 0.14, w: 0.14, h: 0.20, r: '40deg', c: '#8db0ff' },
  ];
  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View style={{ width: size, height: size }}>
        {shards.map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: s.l * size,
              top: s.t * size,
              width: 0,
              height: 0,
              borderLeftWidth: (s.w * size) / 2,
              borderRightWidth: (s.w * size) / 2,
              borderBottomWidth: s.h * size,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: s.c,
              transform: [{ rotate: s.r }],
            }}
          />
        ))}
      </View>
    </View>
  );
}

// 별자리 상자(水): 어두운 상자 + 고리 무늬 + 물(푸른) 점
function StarBoxIcon({ size = 44 }: { size?: number }) {
  const s = size * 0.82;
  const ring = s * 0.58;
  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View style={{ width: s, height: s, borderRadius: s * 0.16, backgroundColor: '#2d2f36', borderWidth: Math.max(1, size * 0.04), borderColor: '#6b6f7a', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: Math.max(1.5, s * 0.1), borderColor: '#b9a77a', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.16, height: s * 0.16, borderRadius: s * 0.08, backgroundColor: '#5aa9ff' }} />
        </View>
      </View>
    </View>
  );
}

function RewardIcon({ id, size }: { id: RewardId; size: number }) {
  if (id === 'ruby') return <RubyIcon size={size} />;
  if (id === 'slab') return <SlabIcon size={size} />;
  if (id === 'jade') return <JadeIcon size={size} />;
  return <StarBoxIcon size={size} />;
}

/* ── 화면 ────────────────────────────────────────────────── */

export default function SaminScreen() {
  const router = useRouter();
  const [store, setStore] = useState<Store>(EMPTY);
  const [now, setNow] = useState(Date.now());
  const [dialog, setDialog] = useState(false);
  const [draftStart, setDraftStart] = useState(Date.now());
  const [draftKind, setDraftKind] = useState<Kind>('sam');
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
        active: parsed?.active?.startedAt ? { startedAt: parsed.active.startedAt, kind: kindOf(parsed.active.kind) } : null,
        records: Array.isArray(parsed?.records) ? parsed.records : [],
      });
    } catch (e) { console.log('삼인검 불러오기 실패:', e); }
  };

  const save = useCallback(async (next: Store) => {
    setStore(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const scheduleAlarm = async (endAt: number, kind: Kind) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(NOTI_ID).catch(() => { });
      if (endAt <= Date.now()) return;
      const label = KINDS[kind].label; // lib/backup.ts 의 알림 문구와 같게
      await Notifications.scheduleNotificationAsync({
        identifier: NOTI_ID,
        content: { title: label, body: `${label} 임무가 끝났습니다. 보상을 받아가세요.` },
        trigger: { type: 'date', date: new Date(endAt) } as any,
      });
    } catch (e) { console.log('삼인검 알림 실패:', e); }
  };

  const clearAlarm = async () => {
    try { await Notifications.cancelScheduledNotificationAsync(NOTI_ID); } catch { }
  };

  /* ── 동작 ── */

  const startNow = async (kind: Kind) => {
    const at = Date.now();
    await save({ ...store, active: { startedAt: at, kind } });
    await scheduleAlarm(at + DURATION_MS, kind);
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
    const rec: Record = { id: makeId(), startedAt, completedAt: startedAt + DURATION_MS, kind: kindOf(store.active.kind) };
    await save({ active: null, records: [...store.records, rec] });
    await clearAlarm();
  };

  const openDialog = () => {
    setDraftStart(store.active ? store.active.startedAt : Date.now());
    if (store.active) setDraftKind(kindOf(store.active.kind)); // 진행 중이면 그 종류부터, 아니면 마지막에 고른 종류 그대로
    setDialog(true);
  };

  const shiftDraft = (ms: number) => setDraftStart((v) => v + ms);

  // 맞춘 시각이 아직 진행 중이면 타이머로, 이미 지났으면 완료 기록으로
  const submitDialog = async () => {
    const endAt = draftStart + DURATION_MS;
    setDialog(false);
    if (endAt > Date.now()) {
      await save({ ...store, active: { startedAt: draftStart, kind: draftKind } });
      await scheduleAlarm(endAt, draftKind);
    } else {
      const rec: Record = { id: makeId(), startedAt: draftStart, completedAt: endAt, manual: true, kind: draftKind };
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
  const chipRecords = [...store.records].sort((a, b) => a.completedAt - b.completedAt);
  // 회차 번호는 종류별로 센다 (삼인검 3회차, 사인검 1회차 …)
  const indexOf = (r: Record) => {
    const same = store.records.filter((x) => kindOf(x.kind) === kindOf(r.kind)).sort((a, b) => a.completedAt - b.completedAt);
    return same.findIndex((x) => x.id === r.id) + 1;
  };
  const samCount = store.records.filter((r) => kindOf(r.kind) === 'sam').length;
  const saCount = count - samCount;
  const counts: { [K in Kind]: number } = { sam: samCount, sa: saCount };
  // 누적 보상 줄: 삼인검은 항상, 사인검은 한 번이라도 했을 때만 (화면을 짧게)
  const rewardKinds = KIND_LIST.filter((k) => k === 'sam' || counts[k] > 0);

  const draftEnd = draftStart + DURATION_MS;
  const draftRunning = draftEnd > Date.now();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>⚔️ 삼인검·사인검 기록</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* 임무 진행 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>임무 진행</Text>
            {store.active && (
              <Text style={[styles.runKind, { color: KINDS[kindOf(store.active.kind)].color }]}>
                {KINDS[kindOf(store.active.kind)].label}
              </Text>
            )}
          </View>

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

              <Text style={styles.runLine}>시작 {formatShort(store.active.startedAt)}  →  완료 예정 {formatShort(endAt)}</Text>

              {isDone && (
                <Pressable style={styles.primaryBtn} onPress={completeRun}>
                  <Text style={styles.primaryBtnText}>완료 기록하기</Text>
                </Pressable>
              )}

              <View style={styles.linkRowInline}>
                <Pressable onPress={cancelRun} hitSlop={8}>
                  <Text style={styles.linkDanger}>타이머 취소</Text>
                </Pressable>
                <Pressable onPress={openDialog} hitSlop={8}>
                  <Text style={styles.linkPrimary}>이미 시작한 임무 기록하기</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.idleText}>진행 중인 임무가 없어요</Text>
              <View style={styles.kindRow}>
                {KIND_LIST.map((k) => (
                  <Pressable key={k} style={[styles.kindStartBtn, { backgroundColor: KINDS[k].color }]} onPress={() => startNow(k)}>
                    <Text style={styles.primaryBtnText}>{KINDS[k].label} 시작</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={openDialog} style={styles.linkRowCenter} hitSlop={8}>
                <Text style={styles.linkPrimary}>이미 시작한 임무 기록하기</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* 누적 보상 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>누적 보상</Text>

          {rewardKinds.map((k) => (
            <View key={k} style={styles.rewardLine}>
              <View style={[styles.kindChip, { backgroundColor: KINDS[k].color }]}>
                <Text style={styles.kindChipText}>{KINDS[k].short}</Text>
              </View>
              {REWARDS[k].map((rw) => (
                <View key={rw.id} style={styles.rewardItem}>
                  <RewardIcon id={rw.id} size={28} />
                  <View style={styles.rewardTexts}>
                    <Text style={styles.rewardName}>{rw.name}</Text>
                    <Text style={[styles.rewardCount, { color: rw.color }]}>×{counts[k] * rw.per}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}

          {count > 0 && (
            <View style={styles.chipWrap}>
              {chipRecords.map((r) => (
                <View key={r.id} style={styles.chip}>
                  {REWARDS[kindOf(r.kind)].map((rw) => (
                    <RewardIcon key={rw.id} id={rw.id} size={16} />
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 기록 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            기록 ({count}회{saCount > 0 ? ` · 삼 ${samCount} · 사 ${saCount}` : ''})
          </Text>

          {store.active && (
            <View style={styles.logRow}>
              <View style={styles.logLeft}>
                <View style={[styles.kindChip, { backgroundColor: KINDS[kindOf(store.active.kind)].color }]}>
                  <Text style={styles.kindChipText}>{KINDS[kindOf(store.active.kind)].short}</Text>
                </View>
                <View style={[styles.badge, styles.badgeGap]}><Text style={styles.badgeText}>진행중</Text></View>
                <Text style={[styles.logRange, styles.logRangeGap]}>
                  {formatShort(store.active.startedAt)} ~ {formatShort(endAt)}
                </Text>
              </View>
            </View>
          )}

          {count === 0 && !store.active && <Text style={styles.empty}>아직 기록이 없어요</Text>}

          {listed.map((r) => (
            <View key={r.id} style={styles.logRow}>
              <View style={styles.logLeft}>
                <View style={[styles.kindChip, { backgroundColor: KINDS[kindOf(r.kind)].color }]}>
                  <Text style={styles.kindChipText}>{KINDS[kindOf(r.kind)].short}</Text>
                </View>
                <Text style={[styles.logText, styles.logRangeGap]}>
                  <Text style={styles.logNo}>{indexOf(r)}회차</Text>
                  {'  ·  '}
                  {formatShort(r.startedAt)} ~ {formatShort(r.completedAt)}
                </Text>
              </View>
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

            <View style={styles.kindPickRow}>
              {KIND_LIST.map((k) => {
                const on = draftKind === k;
                return (
                  <Pressable
                    key={k}
                    style={[styles.kindPick, on && { backgroundColor: KINDS[k].color, borderColor: KINDS[k].color }]}
                    onPress={() => setDraftKind(k)}
                  >
                    <Text style={[styles.kindPickText, on && { color: '#fff' }]}>{KINDS[k].label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sheetSub}>임무를 시작한 시각을 맞춰주세요 · 종료는 30시간 뒤로 자동 계산돼요</Text>

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

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f5f7fa' },
  backBtn: { minWidth: 56 },
  backText: { color: PURPLE, fontSize: 15, fontWeight: 'bold' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#1f2937' },

  content: { padding: 12, paddingBottom: 20 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, elevation: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 14, fontWeight: 'bold', color: '#1f2937' },
  runKind: { fontSize: 13, fontWeight: 'bold' },

  clock: { fontSize: 34, fontWeight: '900', color: '#1f2937', textAlign: 'center', marginTop: 4, letterSpacing: 1 },
  clockCaption: { fontSize: 12, color: '#9aa5b1', textAlign: 'center', marginTop: 2 },
  doneBig: { fontSize: 24, fontWeight: '900', color: '#2d9c5a', textAlign: 'center', marginTop: 6 },
  idleText: { fontSize: 14, color: '#9aa5b1', textAlign: 'center', marginTop: 10 },

  barTrack: { height: 7, borderRadius: 4, backgroundColor: '#eceff3', marginTop: 10, overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4, backgroundColor: PURPLE },

  runLine: { fontSize: 13, color: '#8b96a5', textAlign: 'center', marginTop: 8 },

  primaryBtn: { backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  primaryBtnWide: { flex: 1, backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  linkRowInline: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 10 },
  linkRowCenter: { paddingTop: 12, paddingBottom: 2, alignItems: 'center' },
  linkDanger: { color: '#e74c3c', fontWeight: 'bold', fontSize: 14 },
  linkPrimary: { color: PURPLE, fontWeight: 'bold', fontSize: 14 },

  iconBox: { alignItems: 'center', justifyContent: 'center' },

  rewardLine: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  rewardItem: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 6 },
  rewardTexts: { marginLeft: 6, flexShrink: 1 },
  rewardName: { fontSize: 11, color: '#6b7280', fontWeight: 'bold' },
  rewardCount: { fontSize: 18, fontWeight: '900', color: '#1f2937' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eef1f4' },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f6f9', borderRadius: 8, paddingHorizontal: 3, paddingVertical: 2, margin: 2 },

  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f3f6' },
  logText: { fontSize: 13.5, color: '#4b5563' },
  logNo: { fontWeight: 'bold', color: '#1f2937' },
  logRange: { fontSize: 13.5, color: '#4b5563' },
  badge: { backgroundColor: PURPLE, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  del: { fontSize: 15, color: '#cfd6dd', fontWeight: 'bold', paddingLeft: 10 },
  empty: { color: '#b9c0c8', textAlign: 'center', paddingVertical: 12 },

  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 22 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  sheetSub: { fontSize: 12, color: '#9aa5b1', textAlign: 'center', marginTop: 8 },
  draftRange: { fontSize: 18, fontWeight: '900', color: PURPLE, textAlign: 'center', marginTop: 12 },
  draftRunning: { fontSize: 12, color: '#e17055', textAlign: 'center', marginTop: 6, fontWeight: 'bold' },
  draftFinished: { fontSize: 12, color: '#2d9c5a', textAlign: 'center', marginTop: 6, fontWeight: 'bold' },

  stepRow: { flexDirection: 'row', marginTop: 8 },
  stepBtn: { flex: 1, backgroundColor: '#f1f3f7', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginHorizontal: 4 },
  stepText: { fontSize: 15, fontWeight: 'bold', color: '#374151' },

  shortcutRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },

  sheetButtons: { flexDirection: 'row', marginTop: 12 },
  ghostBtn: { flex: 1, backgroundColor: '#f1f3f7', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginRight: 10 },
  ghostBtnText: { color: '#6b7280', fontWeight: 'bold', fontSize: 15 },

  // 임무 종류(삼인검/사인검)
  kindRow: { flexDirection: 'row', marginTop: 10 },
  kindStartBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginHorizontal: 4 },
  logLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  logRangeGap: { marginLeft: 8, flexShrink: 1 },
  badgeGap: { marginLeft: 6 },
  kindChip: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  kindChipText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  kindPickRow: { flexDirection: 'row', marginTop: 10 },
  kindPick: { flex: 1, borderWidth: 1.5, borderColor: '#dfe3e8', borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginHorizontal: 4, backgroundColor: '#fff' },
  kindPickText: { fontSize: 15, fontWeight: 'bold', color: '#6b7280' },
});
