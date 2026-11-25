import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type MenuItem = { key: string; label: string; onPress: () => void };

/** 메뉴 목록. 항목을 누르면 메뉴를 닫고 그 항목을 실행한다. */
export function MainMenuPanel({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    // 카드 빈 곳을 눌러도 메뉴가 닫히지 않게 터치를 여기서 받는다
    <View style={styles.card} onStartShouldSetResponder={() => true}>
      {items.map((it, i) => (
        <Pressable
          key={it.key}
          style={({ pressed }) => [styles.item, i > 0 && styles.itemBorder, pressed && styles.pressed]}
          onPress={() => { onClose(); it.onPress(); }}
        >
          <Text style={styles.itemText}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 화면 왼쪽 위 ☰ 버튼으로 여는 메뉴. 바깥을 누르거나 뒤로가기를 누르면 닫힌다. */
export default function MainMenu({ visible, items, onClose }: { visible: boolean; items: MenuItem[]; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <MainMenuPanel items={items} onClose={onClose} />
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', paddingTop: 56, paddingLeft: 14, alignItems: 'flex-start' },
  card: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 4, minWidth: 210, elevation: 8 },
  item: { paddingVertical: 13, paddingHorizontal: 16 },
  itemBorder: { borderTopWidth: 1, borderTopColor: '#f1f3f6' },
  pressed: { backgroundColor: '#f4f6f9' },
  itemText: { fontSize: 15, color: '#1f2937', fontWeight: '600' },
});
