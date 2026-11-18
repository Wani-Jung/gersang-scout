import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STORAGE_RUN_KEY = '@gersang_sword_run_v1';   // 진행 중인 회차의 시작 시각
const STORAGE_LOG_KEY = '@gersang_sword_log_v1';   // 완료 기록 [{ at: timestamp }]
const NOTI_ID = 'sword-done';

const DURATION_MS = 30 * 60 * 60 * 1000;  // 삼인검 임무 소요 시간 30시간

// 완료 1회당 받는 보상
const REWARDS = [
  { key: 'ruby', icon: '💎', name: '홍옥상자', perRun: 1, color: '#e84393' },
  { key: 'slab', icon: '🪨', name: '석판상자', perRun: 1, color: '#636e72' },
];

const two = (n: number) => String(n).padStart(2, '0');

const formatRemain = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}시간 ${two(m)}분 ${two(s)}초`;
};

const formatWhen = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${two(d.getHours())}:${two(d.getMinutes())}`;
};

export default function SwordScreen() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [log, setLog] = useState<{ at: number }[]>([]);
  const [now, setNow] = useState(Date.now());
  const tick = useRef<any>(null);

  useEffect(() => {
    load();
    return () => { if (tick.current) clearInterval(tick.current); };
  }, []);

  // 진행 중일 때만 1초마다 남은 시간 갱신
  useEffect(() => {
    if (tick.current) clearInterval(tick.current);
    if (startedAt !== null) {
      setNow(Date.now());
      tick.current = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [startedAt]);

  const load = async () => {
    try {
      const run = await AsyncStorage.getItem(STORAGE_RUN_KEY);
      const saved = await AsyncStorage.getItem(STORAGE_LOG_KEY);
      if (run !== null) setStartedAt(JSON.parse(run));
      if (saved !== null) setLog(JSON.parse(saved));
    } catch (e) { console.log('삼인검 불러오기 실패:', e); }
  };

  const saveRun = async (value: number | null) => {
    setStartedAt(value);
    if (value === null) await AsyncStorage.removeItem(STORAGE_RUN_KEY);
    else await AsyncStorage.setItem(STORAGE_RUN_KEY, JSON.stringify(value));
  };

  const saveLog = async (next: { at: number }[]) => {
    setLog(next);
    await AsyncStorage.setItem(STORAGE_LOG_KEY, JSON.stringify(next));
  };

  const scheduleDoneAlarm = async (endAt: number) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(NOTI_ID).catch(() => {});
      if (endAt <= Date.now()) return;
      await Notifications.scheduleNotificationAsync({
        identifier: NOTI_ID,
        content: { title: '삼인검', body: '삼인검 임무가 끝났습니다. 보상을 받아가세요.' },
        trigger: { type: 'date', date: new Date(endAt) } as any,
      });
    } catch (e) { console.log('삼인검 알림 실패:', e); }
  };

  const clearDoneAlarm = async () => {
    try { await Notifications.cancelScheduledNotificationAsync(NOTI_ID); } catch { }
  };

  const handleStart = async () => {
    const at = Date.now();
    await saveRun(at);
    await scheduleDoneAlarm(at + DURATION_MS);
  };

  const handleCancel = () => {
    Alert.alert('진행 취소', '진행 중인 삼인검을 취소할까요?\n(완료 기록은 남지 않습니다)', [
      { text: '아니오', style: 'cancel' },
      {
        text: '취소하기', style: 'destructive', onPress: async () => {
          await saveRun(null);
          await clearDoneAlarm();
        },
      },
    ]);
  };

  // 진행 중이던 회차를 완료 처리
  const handleComplete = async () => {
    await saveLog([{ at: Date.now() }, ...log]);
    await saveRun(null);
    await clearDoneAlarm();
  };

  // 완료 버튼을 깜빡했을 때 나중에 기록만 추가
  const handleAddManual = () => {
    Alert.alert('완료 기록 추가', '놓친 삼인검 완료를 기록에 추가할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '추가', onPress: async () => { await saveLog([{ at: Date.now() }, ...log]); } },
    ]);
  };

  const handleDelete = (index: number) => {
    Alert.alert('기록 삭제', '이 완료 기록을 지울까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => { await saveLog(log.filter((_, i) => i !== index)); },
      },
    ]);
  };

  const endAt = startedAt !== null ? startedAt + DURATION_MS : 0;
  const remain = endAt - now;
  const isDone = startedAt !== null && remain <= 0;
  const progress = startedAt === null ? 0 : Math.min(1, Math.max(0, (now - startedAt) / DURATION_MS));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* 누적 보상 */}
        <View style={styles.rewardRow}>
          {REWARDS.map((r) => (
            <View key={r.key} style={styles.rewardTile}>
              <Text style={styles.rewardIcon}>{r.icon}</Text>
              <Text style={[styles.rewardCount, { color: r.color }]}>{log.length * r.perRun}</Text>
              <Text style={styles.rewardName}>{r.name}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.totalLine}>지금까지 {log.length}회 완료</Text>

        {/* 진행 상태 */}
        <View style={styles.card}>
          {startedAt === null ? (
            <>
              <Text style={styles.statusIdle}>진행 중인 삼인검이 없습니다</Text>
              <Text style={styles.statusSub}>시작하면 30시간 뒤에 알림이 울립니다</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleStart} activeOpacity={0.8}>
                <Text style={styles.primaryButtonText}>시작하기</Text>
              </TouchableOpacity>
            </>
          ) : isDone ? (
            <>
              <Text style={styles.statusDone}>✅ 완료 가능</Text>
              <Text style={styles.statusSub}>{formatWhen(startedAt)}에 시작했습니다</Text>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: '100%' }]} /></View>
              <TouchableOpacity style={styles.primaryButton} onPress={handleComplete} activeOpacity={0.8}>
                <Text style={styles.primaryButtonText}>보상 받고 기록하기</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.statusRunning}>진행 중</Text>
              <Text style={styles.remainText}>{formatRemain(remain)} 남음</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.statusSub}>{formatWhen(endAt)} 완료 예정</Text>
              <TouchableOpacity style={styles.ghostButton} onPress={handleCancel} activeOpacity={0.7}>
                <Text style={styles.ghostButtonText}>진행 취소</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 기록 */}
        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>완료 기록</Text>
          <TouchableOpacity onPress={handleAddManual} activeOpacity={0.7}>
            <Text style={styles.addText}>+ 놓친 회차 추가</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {log.length === 0 ? (
            <Text style={styles.emptyText}>아직 기록이 없습니다</Text>
          ) : (
            log.map((item, index) => (
              <View key={item.at + '-' + index} style={styles.logRow}>
                <Text style={styles.logDate}>{formatWhen(item.at)}</Text>
                <View style={styles.logRight}>
                  <Text style={styles.logReward}>💎1 🪨1</Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(index)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.deleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 20, paddingBottom: 30 },

  rewardRow: { flexDirection: 'row', gap: 12 },
  rewardTile: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 18, alignItems: 'center', elevation: 3 },
  rewardIcon: { fontSize: 34 },
  rewardCount: { fontSize: 30, fontWeight: '900', marginTop: 4 },
  rewardName: { fontSize: 13, color: '#636e72', marginTop: 2, fontWeight: 'bold' },
  totalLine: { textAlign: 'center', color: '#8a94a6', fontSize: 13, marginTop: 10, marginBottom: 18 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 18, elevation: 2 },

  statusIdle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', textAlign: 'center' },
  statusRunning: { fontSize: 14, fontWeight: 'bold', color: '#6c5ce7', textAlign: 'center' },
  statusDone: { fontSize: 18, fontWeight: '900', color: '#2d9c5a', textAlign: 'center' },
  statusSub: { fontSize: 13, color: '#8a94a6', textAlign: 'center', marginTop: 6 },
  remainText: { fontSize: 26, fontWeight: '900', color: '#2c3e50', textAlign: 'center', marginTop: 6 },

  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#ecf0f4', marginTop: 14, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#6c5ce7' },

  primaryButton: { backgroundColor: '#6c5ce7', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  ghostButton: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  ghostButtonText: { color: '#b2bec3', fontWeight: 'bold', fontSize: 14 },

  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 10 },
  logTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  addText: { fontSize: 13, color: '#6c5ce7', fontWeight: 'bold' },

  emptyText: { color: '#b2bec3', textAlign: 'center', paddingVertical: 14 },
  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f2f6' },
  logDate: { fontSize: 15, color: '#555' },
  logRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logReward: { fontSize: 13, color: '#8a94a6' },
  deleteText: { fontSize: 16, color: '#dfe4ea', fontWeight: 'bold' },
});
