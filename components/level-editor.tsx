import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { LEVEL_MAX, LEVEL_MIN, parseLevel } from '@/lib/levels';

type PanelProps = {
  headers: string[];            // 계정 이름 (92, mi, …)
  names: string[];              // 대표 캐릭 이름 (각 계정 맨 윗칸)
  levels: (number | null)[];    // 지금 레벨 (null = 표시 안 함)
  highLevel: number;            // 이 값 이상이면 진하게 (메인 화면과 같은 기준)
  onClose: () => void;
  onSave: (next: (number | null)[]) => void;
};

const toText = (v: number | null) => (v === null ? '' : String(v));

/** 레벨 수정 창의 내용. 창을 열 때마다 새로 만들어져서 지금 레벨에서 시작한다. */
export function LevelEditorPanel({ headers, names, levels, highLevel, onClose, onSave }: PanelProps) {
  const [texts, setTexts] = useState<string[]>(() => levels.map(toText));

  const parsed = texts.map(parseLevel);
  const hasError = parsed.some((p) => p === undefined);

  const setAt = (i: number, v: string) => setTexts((t) => t.map((x, j) => (j === i ? v : x)));

  // −/+ 버튼: 지금 칸 값(비었으면 원래 레벨, 그것도 없으면 200)에서 1씩
  const step = (i: number, d: number) => {
    const cur = parseLevel(texts[i]);
    const base = typeof cur === 'number' ? cur : levels[i] ?? 200;
    setAt(i, String(Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, base + d))));
  };

  const save = () => {
    if (hasError) return;
    onSave(parsed.map((p) => (p === undefined ? null : p)));
  };

  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>캐릭별 레벨 수정</Text>
      <Text style={styles.sub}>각 계정 대표 캐릭(맨 윗칸)의 레벨이에요. 비우면 표시하지 않아요.</Text>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {headers.map((h, i) => {
          const p = parsed[i];
          const bad = p === undefined;
          const high = typeof p === 'number' && p >= highLevel;
          return (
            <View key={h} style={styles.row}>
              <Text style={styles.account}>{h}</Text>
              <Text style={styles.name} numberOfLines={1}>{names[i]}</Text>
              <Pressable style={styles.stepBtn} onPress={() => step(i, -1)} hitSlop={6} accessibilityLabel={`${h} 레벨 1 내리기`}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <TextInput
                style={[styles.input, high && styles.inputHigh, bad && styles.inputBad]}
                value={texts[i]}
                onChangeText={(v) => setAt(i, v)}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="-"
                placeholderTextColor="#c3cad4"
                selectTextOnFocus
                accessibilityLabel={`${h} 레벨`}
              />
              <Pressable style={styles.stepBtn} onPress={() => step(i, 1)} hitSlop={6} accessibilityLabel={`${h} 레벨 1 올리기`}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {hasError && <Text style={styles.error}>레벨은 {LEVEL_MIN}~{LEVEL_MAX} 사이 숫자로 적어 주세요.</Text>}

      <View style={styles.buttons}>
        <Pressable style={styles.ghostBtn} onPress={onClose}>
          <Text style={styles.ghostText}>취소</Text>
        </Pressable>
        <Pressable style={[styles.saveBtn, hasError && styles.saveBtnOff]} onPress={save} disabled={hasError}>
          <Text style={styles.saveText}>저장</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function LevelEditor({ visible, ...rest }: PanelProps & { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={rest.onClose}>
      <View style={styles.dim}>{visible && <LevelEditorPanel {...rest} />}</View>
    </Modal>
  );
}

const PURPLE = '#6c5ce7';

const styles = StyleSheet.create({
  // 키보드가 올라와도 위쪽이 가려지지 않게 화면 위쪽에 붙인다
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-start', paddingTop: 48, paddingHorizontal: 18 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  sub: { fontSize: 12, color: '#9aa5b1', marginTop: 4 },
  list: { maxHeight: 420, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f3f6' },
  account: { width: 34, fontSize: 15, fontWeight: 'bold', color: '#1f2937' },
  name: { flex: 1, fontSize: 14, color: '#4b5563', marginRight: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#f1f3f7', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: 'bold', color: '#374151' },
  input: { width: 58, height: 36, marginHorizontal: 6, borderWidth: 1.5, borderColor: '#dfe3e8', borderRadius: 8, textAlign: 'center', fontSize: 15, color: '#7b8696', paddingVertical: 0 },
  inputHigh: { color: '#000', fontWeight: '800' },
  inputBad: { borderColor: '#e74c3c', color: '#e74c3c' },
  error: { fontSize: 12, color: '#e74c3c', marginTop: 8 },
  buttons: { flexDirection: 'row', marginTop: 14 },
  ghostBtn: { flex: 1, backgroundColor: '#f1f3f7', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginRight: 10 },
  ghostText: { color: '#6b7280', fontWeight: 'bold', fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnOff: { opacity: 0.4 },
  saveText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
