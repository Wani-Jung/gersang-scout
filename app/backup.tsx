import React, { useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyBackup, exportBackupFile, parseBackup, pickBackupText, summarizeBackup } from '@/lib/backup';

export default function BackupScreen() {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exportBackupFile();
    } catch (e) {
      console.log('백업 내보내기 실패:', e);
      Alert.alert('백업 실패', e instanceof Error ? e.message : '내보내는 중 오류가 났어요.');
    } finally {
      setBusy(false);
    }
  };

  const doApply = async (data: Record<string, unknown>) => {
    setBusy(true);
    try {
      await applyBackup(data);
      // 열려 있는 화면들이 예전 값을 들고 있으므로, 앱을 닫고 다시 열어야 새 기록이 보인다
      Alert.alert('불러오기 완료', '백업한 기록으로 바꿨어요.\n앱을 종료할게요. 다시 열어 주세요.', [
        { text: '확인', onPress: () => BackHandler.exitApp() },
      ], { cancelable: false });
    } catch (e) {
      console.log('백업 불러오기 실패:', e);
      Alert.alert('불러오기 실패', '오류가 나서 원래 기록으로 되돌렸어요.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (busy) return;
    setBusy(true);
    let text: string | null;
    try {
      text = await pickBackupText();
    } catch (e) {
      setBusy(false);
      console.log('백업 파일 읽기 실패:', e);
      Alert.alert('파일을 읽을 수 없어요', e instanceof Error ? e.message : '파일을 여는 중 오류가 났어요.');
      return;
    }
    setBusy(false);
    if (text === null) return;

    const parsed = parseBackup(text);
    if ('error' in parsed) {
      Alert.alert('불러올 수 없어요', parsed.error);
      return;
    }
    const s = summarizeBackup(parsed.data);
    Alert.alert(
      '백업 불러오기',
      `정탐 기록 ${s.days}일, 삼인검 ${s.sam}회${s.sa > 0 ? `, 사인검 ${s.sa}회` : ''}${s.running ? ' (진행 중 1건 포함)' : ''}가 들어 있어요.\n지금 기록은 이 백업으로 바뀌어요. 계속할까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '불러오기', style: 'destructive', onPress: () => doApply(parsed.data) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>백업 내보내기</Text>
          <Text style={styles.desc}>
            정탐 기록과 삼인검 기록을 파일 하나로 저장해요. 공유창에서 구글 드라이브, 파일 저장, 카톡 &quot;나에게 보내기&quot; 등을 골라 보관하세요.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleExport} disabled={busy} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>백업 파일 만들기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>백업 불러오기</Text>
          <Text style={styles.desc}>
            저장해 둔 백업 파일을 골라 기록을 되돌려요. 지금 기록은 그 파일의 내용으로 바뀌고, 끝나면 앱이 한 번 종료돼요.
          </Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleImport} disabled={busy} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>백업 파일 고르기</Text>
          </TouchableOpacity>
        </View>

        {busy && <ActivityIndicator style={styles.spinner} color="#6c5ce7" />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 20, paddingBottom: 30 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  desc: { fontSize: 13, color: '#636e72', marginTop: 8, lineHeight: 19 },
  primaryButton: { backgroundColor: '#6c5ce7', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#6c5ce7', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  secondaryButtonText: { color: '#6c5ce7', fontWeight: 'bold', fontSize: 16 },
  spinner: { marginTop: 10 },
});
