import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { LEVEL_MAX, LEVEL_MIN, parseLevel } from '@/lib/levels';

type PanelProps = {
  headers: string[];            // 계정 이름 (92, mi, …)
  names: string[][];            // [계정][칸] 캐릭 이름 (메인 화면 칸과 같은 순서)
  levels: (number | null)[][];  // [계정][칸] 지금 레벨 (null = 표시 안 함)
  order: number[];              // 메인 화면의 열 순서 (같은 배치로 보여 준다)
  highLevel: number;            // 이 값 이상이면 진하게 (메인 화면과 같은 기준)
  onClose: () => void;
  onSave: (next: (number | null)[][]) => void;
};

type Pos = { col: number; row: number }; // col = 계정 번호(HEADERS 순서), row = 칸

const toText = (v: number | null) => (v === null ? '' : String(v));

/**
 * 레벨 수정 창의 내용. 길게 내려가는 목록 대신 메인 화면과 같은 격자(계정 × 3칸)를 한 화면에 보여 주고,
 * 칸을 누르면 위쪽 입력칸에서 고친다. 숫자 3자리를 치면 다음 칸으로 자동으로 넘어간다(계정 안 위→아래, 다음 계정).
 */
export function LevelEditorPanel({ headers, names, levels, order, highLevel, onClose, onSave }: PanelProps) {
  const [texts, setTexts] = useState<string[][]>(() => levels.map((c) => c.map(toText)));
  const [sel, setSel] = useState<Pos>({ col: order[0] ?? 0, row: 0 });
  // 칸을 고른 직후에는 입력칸이 비어 있고 지금 값이 흐리지 않게 보인다 → 치는 숫자가 지금 값을 통째로 바꾼다
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const parsed = texts.map((c) => c.map(parseLevel));
  const hasError = parsed.some((c) => c.some((p) => p === undefined));
  const rows = names[0]?.length ?? 3;

  const setAt = (p: Pos, v: string) =>
    setTexts((t) => t.map((c, ci) => (ci !== p.col ? c : c.map((x, ri) => (ri === p.row ? v : x)))));

  const select = (p: Pos) => {
    setSel(p);
    setDraft(null);
    inputRef.current?.focus();
  };

  // 다음 칸: 같은 계정의 아래 칸 → 다음 계정(화면 순서)의 맨 윗칸. 마지막 칸이면 그대로.
  const nextOf = (p: Pos): Pos | null => {
    if (p.row + 1 < rows) return { col: p.col, row: p.row + 1 };
    const i = order.indexOf(p.col);
    return i >= 0 && i + 1 < order.length ? { col: order[i + 1], row: 0 } : null;
  };

  const onType = (v: string) => {
    setDraft(v);
    setAt(sel, v);
    if (/^\d{3}$/.test(v) && typeof parseLevel(v) === 'number') {
      const n = nextOf(sel);
      if (n) { setSel(n); setDraft(null); }
    }
  };

  // −/+ 버튼: 지금 값(비었으면 원래 레벨, 그것도 없으면 200)에서 1씩
  const step = (d: number) => {
    const cur = parseLevel(texts[sel.col][sel.row]);
    const base = typeof cur === 'number' ? cur : levels[sel.col][sel.row] ?? 200;
    setAt(sel, String(Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, base + d))));
    setDraft(null);
  };

  const save = () => {
    if (hasError) return;
    onSave(parsed.map((c) => c.map((p) => (p === undefined ? null : p))));
  };

  const curText = texts[sel.col][sel.row];
  const curParsed = parsed[sel.col][sel.row];
  const curHigh = typeof curParsed === 'number' && curParsed >= highLevel;

  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>캐릭별 레벨 수정</Text>
      <Text style={styles.sub}>칸을 누르고 숫자 3자리를 치면 다음 칸으로 넘어가요. 비우면 표시하지 않아요.</Text>

      {/* 고르고 있는 칸 */}
      <View style={styles.editRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.editAccount}>{headers[sel.col]}</Text>
          <Text style={styles.editName} numberOfLines={1}>{names[sel.col][sel.row]}</Text>
        </View>
        <Pressable style={styles.stepBtn} onPress={() => step(-1)} hitSlop={6} accessibilityLabel="레벨 1 내리기">
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <TextInput
          ref={inputRef}
          style={[styles.input, curHigh && styles.inputHigh, curParsed === undefined && styles.inputBad]}
          value={draft ?? ''}
          placeholder={curText === '' ? '-' : curText}
          placeholderTextColor={curText === '' ? '#c3cad4' : curHigh ? '#000' : '#4b5563'}
          onChangeText={onType}
          keyboardType="number-pad"
          maxLength={3}
          autoFocus
          accessibilityLabel={`${headers[sel.col]} ${names[sel.col][sel.row]} 레벨`}
        />
        <Pressable style={styles.stepBtn} onPress={() => step(1)} hitSlop={6} accessibilityLabel="레벨 1 올리기">
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>

      {/* 메인 화면과 같은 배치의 격자 */}
      <View style={styles.grid}>
        {order.map((col) => (
          <View key={col} style={styles.gridCol}>
            <Text style={styles.gridHead} numberOfLines={1}>{headers[col]}</Text>
            {names[col].map((name, row) => {
              const p = parsed[col][row];
              const on = sel.col === col && sel.row === row;
              const high = typeof p === 'number' && p >= highLevel;
              return (
                <Pressable
                  key={row}
                  style={[styles.cell, on && styles.cellOn, p === undefined && styles.cellBad]}
                  onPress={() => select({ col, row })}
                  accessibilityLabel={`${headers[col]} ${name}`}
                >
                  <Text style={styles.cellName} numberOfLines={1}>{name}</Text>
                  <Text style={[styles.cellLevel, high && styles.cellLevelHigh]} numberOfLines={1}>
                    {texts[col][row] === '' ? '-' : texts[col][row]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

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
  // 키보드가 올라와도 가려지지 않게 화면 위쪽에 붙이고, 한 화면에 다 들어가게 작게 만든다
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-start', paddingTop: 40, paddingHorizontal: 8 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 12 },
  title: { fontSize: 17, fontWeight: 'bold', color: '#1f2937' },
  sub: { fontSize: 11, color: '#9aa5b1', marginTop: 3 },
  editRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#f6f5ff', borderRadius: 10 },
  editAccount: { fontSize: 12, fontWeight: 'bold', color: PURPLE },
  editName: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
  stepBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e1f5', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: 'bold', color: '#374151' },
  input: { width: 64, height: 38, marginHorizontal: 6, borderWidth: 1.5, borderColor: PURPLE, borderRadius: 8, backgroundColor: '#fff', textAlign: 'center', fontSize: 17, color: '#4b5563', paddingVertical: 0 },
  inputHigh: { color: '#000', fontWeight: '800' },
  inputBad: { borderColor: '#e74c3c', color: '#e74c3c' },
  grid: { flexDirection: 'row', marginTop: 10 },
  gridCol: { flex: 1, marginHorizontal: 1 },
  gridHead: { fontSize: 11, fontWeight: 'bold', color: '#1f2937', textAlign: 'center', marginBottom: 2 },
  cell: { height: 40, marginVertical: 1, borderRadius: 6, backgroundColor: '#f1f3f7', borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  cellOn: { borderColor: PURPLE, backgroundColor: '#efedff' },
  cellBad: { borderColor: '#e74c3c' },
  cellName: { fontSize: 9, color: '#5b6470', fontWeight: '600' },
  cellLevel: { fontSize: 11, color: '#7b8696', fontWeight: '500', marginTop: 1 },
  cellLevelHigh: { color: '#000', fontWeight: '800' },
  error: { fontSize: 12, color: '#e74c3c', marginTop: 8 },
  buttons: { flexDirection: 'row', marginTop: 12 },
  ghostBtn: { flex: 1, backgroundColor: '#f1f3f7', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginRight: 10 },
  ghostText: { color: '#6b7280', fontWeight: 'bold', fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  saveBtnOff: { opacity: 0.4 },
  saveText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
