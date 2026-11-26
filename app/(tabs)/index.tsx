import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Animated, PanResponder, Linking } from 'react-native';
// 안드로이드에서도 상태표시줄·하단 내비게이션 바를 실제로 비켜주는 SafeAreaView
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import LevelEditor from '@/components/level-editor';
import MainMenu from '@/components/main-menu';
import { normalizeLevels, normalizeSubLevels } from '@/lib/levels';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const HEADERS = ['92', 'mi', '91', '93', '94', '57', '58', '59'];
const SUB_LABELS = [
  ['★', '들창', '날창'],
  ['들쭉', '완동잇', '달동잇'],
  ['한양', '임시', '람채화'],
  ['들숨반', '들정령', '들작땅'],
  ['날뻔', '날듯', '날심'],
  ['가설', '철골', '패널'],
  ['모자', '맨끝소', '참심판'],
  ['피겜', '지녀스', '소사겜'],
];
const ROWS = 3;
const COLS = 8;           // 전체 계정 수
const VISIBLE_COLS = 8;   // 화면에 한 번에 보이는 칸 수 (칸 크기 기준)
const STORAGE_GRID_KEY = '@gersang_grid_state_v8';
const STORAGE_HEADER_KEY = '@gersang_header_state_v8';
const STORAGE_DATE_KEY = '@gersang_last_date_v8';
const STORAGE_HISTORY_KEY = '@gersang_history_v8';
const STORAGE_FINALIZED_KEY = '@gersang_finalized_v8';
const STORAGE_ORDER_KEY = '@gersang_col_order_v8';
const STORAGE_MISSION_KEY = '@gersang_mission_v8';
const STORAGE_LOGIN_KEY = '@gersang_login_v1';   // 접속 체크 (미션처럼 매일 초기화). lib/backup.ts 의 KEY 와 같은 값
const STORAGE_LEVELS_KEY = '@gersang_levels_v1'; // 메뉴에서 고친 대표 캐릭(맨 윗칸) 레벨 [계정] (폰에만 저장). lib/backup.ts 의 KEY 와 같은 값
const STORAGE_SUBLEVELS_KEY = '@gersang_sublevels_v1'; // 나머지 캐릭(2·3번째 칸) 레벨 [계정][2] (폰에만 저장, 기본 210). lib/backup.ts 의 KEY 와 같은 값

// 항상 최신 릴리스 APK 를 가리키는 고정 다운로드 링크 (README, CLAUDE.md, release.yml 의 APK_NAME 과 같은 주소)
const UPDATE_URL = 'https://github.com/Wani-Jung/gersang-scout/releases/latest/download/gersang-scout.apk';

// 계정별 대표 캐릭터 레벨의 '기본값'. HEADERS 순서(열 번호)대로. null 은 표시하지 않음.
// 메뉴 > 캐릭별 레벨 수정에서 고치면 폰에 저장된 값이 대신 쓰인다 (코드를 고칠 필요 없음).
//   92(★ 들숨) 260 / mi(들쭉) 210 / 91(한양) 220 / 93(들숨반) 211 / 94(날뻔) 210 / 57(가설) 250 / 58(모자) 210 / 59(피겜) 221
const LEVELS: (number | null)[] = [260, 210, 220, 211, 210, 250, 210, 221];
const HIGH_LEVEL = 220; // 이 렙 이상이면 렙 숫자를 진하게(검은색) 표시

// 각 열에서 기본 분모에 들어가는 칸 수 (합계 24칸)
const ACTIVE_LIMITS = [3, 3, 3, 3, 3, 3, 3, 3];

// 체크했을 때만 분모에 추가되는 보너스 칸 (지금은 없음)
const isSpecialCell = (r, c) => false;

// 검은 테두리로 강조할 칸: 92의 ★, 57의 가설
const HIGHLIGHT_CELLS = [[0, 0], [5, 0]];
const isHighlightCell = (r, c) => HIGHLIGHT_CELLS.some(([hc, hr]) => hc === c && hr === r);

// 기본 열 배치
const DEFAULT_ORDER = [0, 1, 2, 3, 4, 5, 6, 7];

// 저장된 데이터가 예전 8칸짜리여도 깨지지 않게 크기를 맞춰줌
const normalizeGrid = (g) =>
  Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => !!(g && g[r] && g[r][c]))
  );

// 기록을 월별로 묶는다. 연도가 없는 예전 기록은 최신부터 거슬러 올라가며 추정한다.
const buildMonths = (list) => {
  const now = new Date();
  let year = now.getFullYear();
  let prevMonth = now.getMonth() + 1;
  const out = [];
  let cur = null;

  for (const item of list) {
    const m = parseInt(item.date, 10);
    if (item.year !== undefined) year = item.year;
    else if (m > prevMonth) year -= 1;
    prevMonth = m;

    const key = year + '-' + m;
    if (!cur || cur.key !== key) {
      cur = { key, year, month: m, items: [] };
      out.push(cur);
    }
    cur.items.push(item);
  }
  return out;
};

const normalizeFlags = (a) =>
  Array.from({ length: COLS }, (_, c) => !!(a && a[c]));

export default function App() {
  const router = useRouter();
  const [gridState, setGridState] = useState(Array.from({ length: ROWS }, () => Array(COLS).fill(false)));
  const [headerState, setHeaderState] = useState(Array(COLS).fill(false));
  const [missionState, setMissionState] = useState(Array(COLS).fill(false));
  const [loginState, setLoginState] = useState(Array(COLS).fill(false));
  const [historyData, setHistoryData] = useState([]);
  const [monthIndex, setMonthIndex] = useState(0);
  const [isFinalized, setIsFinalized] = useState(false);
  const [columnOrder, setColumnOrder] = useState(DEFAULT_ORDER);
  const [dragPos, setDragPos] = useState(null);
  const [cellSize, setCellSize] = useState(45);
  // 캐릭 레벨 [계정][칸 0~2]. 맨 윗칸은 LEVELS, 나머지는 기본 210 에서 시작
  const [levels, setLevels] = useState<(number | null)[][]>(() => LEVELS.map((l, c) => [l, ...normalizeSubLevels(null, COLS)[c]]));
  const [menuOpen, setMenuOpen] = useState(false);
  const [levelEditOpen, setLevelEditOpen] = useState(false);

  // 각 화면 위치의 좌우 이동값. 끌고 있는 열도 이 값을 그대로 쓴다.
  const shiftAnims = useRef(Array.from({ length: COLS }, () => new Animated.Value(0))).current;
  const targetPosRef = useRef(null);
  const colWidthRef = useRef(0);
  const columnOrderRef = useRef(columnOrder);
  const headerStateRef = useRef(headerState);
  const finalizedRef = useRef(isFinalized);
  const dragPosRef = useRef(null);
  const scrollRef = useRef(null);
  const scrollXRef = useRef(0);
  const containerLeftRef = useRef(0);
  const visibleWidthRef = useRef(0);
  const fingerXRef = useRef(0);      // 손가락의 화면상 x
  const contentStartXRef = useRef(0); // 잡기 시작한 지점의 격자 내부 x
  const autoScrollTimer = useRef(null);
  const grantPosRef = useRef(0);
  const movedRef = useRef(false);
  const longPressTimer = useRef(null);

  useEffect(() => { columnOrderRef.current = columnOrder; }, [columnOrder]);
  useEffect(() => { headerStateRef.current = headerState; }, [headerState]);
  useEffect(() => { finalizedRef.current = isFinalized; }, [isFinalized]);

  const today = new Date();
  const todayString = `${today.getMonth() + 1}월 ${today.getDate()}일`;
  const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

  let completedCount = 0;
  let totalActiveCount = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r < ACTIVE_LIMITS[c]) {
        totalActiveCount++;
        if (gridState[r][c]) completedCount++;
      } else if (isSpecialCell(r, c)) {
        if (gridState[r][c]) {
          totalActiveCount++;
          completedCount++;
        }
      }
    }
  }

  const months = buildMonths(historyData);
  const curMonth = months.length ? months[Math.min(monthIndex, months.length - 1)] : null;
  const canOlder = monthIndex < months.length - 1;
  const canNewer = monthIndex > 0;

  const missionCount = missionState.filter(Boolean).length;
  const missionH = Math.round(cellSize * 0.52);

  // 앱 시작할 때 한 번만 초기화
  useEffect(() => {
    initializeApp();
  }, []);

  // 진행도가 바뀔 때만 알림 다시 등록
  useEffect(() => {
    setupNotifications(completedCount, totalActiveCount, missionCount);
  }, [completedCount, totalActiveCount, missionCount]);

  const setupNotifications = async (completed, total, mission) => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    // 이 두 개만 지우고 다시 건다 (삼인검 완료 알림까지 날아가지 않도록)
    await Notifications.cancelScheduledNotificationAsync('daily-1130').catch(() => {});
    await Notifications.cancelScheduledNotificationAsync('daily-2200').catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-1130',
      content: { title: "정탐배럭", body: `정탐 ${completed}/${total}, 임무 ${mission}/${COLS} 입니다.` },
      trigger: { hour: 11, minute: 30, repeats: true },
    });

    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-2200',
      content: { title: "정탐배럭", body: `정탐 ${completed}/${total}, 임무 ${mission}/${COLS} 입니다.` },
      trigger: { hour: 22, minute: 0, repeats: true },
    });
  };

  const initializeApp = async () => {
    try {
      const savedDate = await AsyncStorage.getItem(STORAGE_DATE_KEY);
      const savedGrid = await AsyncStorage.getItem(STORAGE_GRID_KEY);
      const savedHeader = await AsyncStorage.getItem(STORAGE_HEADER_KEY);
      const savedHistory = await AsyncStorage.getItem(STORAGE_HISTORY_KEY);
      const savedOrder = await AsyncStorage.getItem(STORAGE_ORDER_KEY);
      const savedMission = await AsyncStorage.getItem(STORAGE_MISSION_KEY);
      const savedLogin = await AsyncStorage.getItem(STORAGE_LOGIN_KEY);
      const savedLevels = await AsyncStorage.getItem(STORAGE_LEVELS_KEY);
      const savedSubLevels = await AsyncStorage.getItem(STORAGE_SUBLEVELS_KEY);

      let currentHistory = savedHistory ? JSON.parse(savedHistory) : [];
      if (savedHeader !== null) setHeaderState(normalizeFlags(JSON.parse(savedHeader)));
      if (savedMission !== null) setMissionState(normalizeFlags(JSON.parse(savedMission)));
      if (savedLogin !== null) setLoginState(normalizeFlags(JSON.parse(savedLogin)));
      {
        const top = normalizeLevels(savedLevels !== null ? JSON.parse(savedLevels) : null, LEVELS);
        const sub = normalizeSubLevels(savedSubLevels !== null ? JSON.parse(savedSubLevels) : null, COLS);
        setLevels(top.map((l, c) => [l, ...sub[c]]));
      }

      // 저장된 열 순서 복원 (개수가 맞는 정상 데이터일 때만)
      if (savedOrder !== null) {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed) && parsed.length === COLS) setColumnOrder(parsed);
      }

      // 중복 기록 자동 청소 로직
      let uniqueHistory = [];
      const seenDates = new Set();
      for (const item of currentHistory) {
        if (!seenDates.has(item.date)) {
          uniqueHistory.push(item);
          seenDates.add(item.date);
        }
      }
      currentHistory = uniqueHistory;

      // 8월 19일 0점 억울함 복구 패치
      let isPatched = false;
      currentHistory = currentHistory.map(item => {
        if (item.date === '8월 19일' && item.completed === 0) {
          isPatched = true;
          return { ...item, completed: 19, total: 19 };
        }
        return item;
      });

      if (isPatched) {
        await AsyncStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(currentHistory));
      }

      // 날짜 변경 및 초기화 로직
      if (savedDate !== todayKey) {
        setIsFinalized(false);
        await AsyncStorage.setItem(STORAGE_FINALIZED_KEY, 'false');

        if (savedDate && savedGrid) {
          const oldGrid = normalizeGrid(JSON.parse(savedGrid));
          const oldMission = savedMission
            ? normalizeFlags(JSON.parse(savedMission)).filter(Boolean).length
            : 0;
          let oldCompleted = 0; let activeCount = 0;
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              if (r < ACTIVE_LIMITS[c]) {
                activeCount++;
                if (oldGrid[r][c]) oldCompleted++;
              } else if (isSpecialCell(r, c)) {
                if (oldGrid[r][c]) {
                  activeCount++;
                  oldCompleted++;
                }
              }
            }
          }
          const [y, m, d] = savedDate.split('-');
          const pastDateString = `${parseInt(m)}월 ${parseInt(d)}일`;

          const record = {
            date: pastDateString,
            year: parseInt(y, 10),
            completed: oldCompleted,
            total: activeCount,
            mission: oldMission,
            missionTotal: COLS,
          };
          const existingIndex = currentHistory.findIndex(item => item.date === pastDateString);
          if (existingIndex !== -1) {
            currentHistory[existingIndex] = record;
          } else {
            currentHistory.unshift(record);
          }

          if (currentHistory.length > 400) currentHistory.pop();
          await AsyncStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(currentHistory));
        }
        const emptyGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
        setGridState(emptyGrid);
        await AsyncStorage.setItem(STORAGE_GRID_KEY, JSON.stringify(emptyGrid));

        const emptyMission = Array(COLS).fill(false);
        setMissionState(emptyMission);
        await AsyncStorage.setItem(STORAGE_MISSION_KEY, JSON.stringify(emptyMission));

        const emptyLogin = Array(COLS).fill(false);
        setLoginState(emptyLogin);
        await AsyncStorage.setItem(STORAGE_LOGIN_KEY, JSON.stringify(emptyLogin));
        await AsyncStorage.setItem(STORAGE_DATE_KEY, todayKey);
      } else {
        if (savedGrid !== null) setGridState(normalizeGrid(JSON.parse(savedGrid)));
        const savedFinalized = await AsyncStorage.getItem(STORAGE_FINALIZED_KEY);
        setIsFinalized(savedFinalized === 'true');
      }
      setHistoryData(currentHistory);
    } catch (error) { console.log('에러:', error); }
  };

  const handleFinalize = () => {
    Alert.alert("기록 확정", "오늘의 기록을 확정하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "확인", onPress: async () => { setIsFinalized(true); await AsyncStorage.setItem(STORAGE_FINALIZED_KEY, 'true'); } }
    ]);
  };

  const handleUnfinalize = () => {
    Alert.alert("확정 해제", "확정해제 하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "확인", onPress: async () => { setIsFinalized(false); await AsyncStorage.setItem(STORAGE_FINALIZED_KEY, 'false'); } }
    ]);
  };

  const toggleButton = async (rowIndex, colId) => {
    if (isFinalized) return;
    if (!(rowIndex < ACTIVE_LIMITS[colId]) && !isSpecialCell(rowIndex, colId)) return;

    const newState = [...gridState];
    newState[rowIndex] = [...newState[rowIndex]];
    newState[rowIndex][colId] = !newState[rowIndex][colId];
    setGridState(newState);
    await AsyncStorage.setItem(STORAGE_GRID_KEY, JSON.stringify(newState));
  };

  const toggleHeader = async (colId) => {
    if (finalizedRef.current) return;
    const newHeaderState = [...headerStateRef.current];
    newHeaderState[colId] = !newHeaderState[colId];
    headerStateRef.current = newHeaderState;
    setHeaderState(newHeaderState);
    await AsyncStorage.setItem(STORAGE_HEADER_KEY, JSON.stringify(newHeaderState));
  };

  const toggleMission = async (colId) => {
    if (isFinalized) return;
    const next = [...missionState];
    next[colId] = !next[colId];
    setMissionState(next);
    await AsyncStorage.setItem(STORAGE_MISSION_KEY, JSON.stringify(next));
  };

  const toggleLogin = async (colId: number) => {
    if (isFinalized) return;
    const next = [...loginState];
    next[colId] = !next[colId];
    setLoginState(next);
    await AsyncStorage.setItem(STORAGE_LOGIN_KEY, JSON.stringify(next));
  };

  const moveColumn = async (from, to) => {
    if (from === to) return;
    const newOrder = [...columnOrderRef.current];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, moved);
    columnOrderRef.current = newOrder;
    setColumnOrder(newOrder);
    await AsyncStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(newOrder));
  };

  // 끌고 있는 열이 비집고 들어갈 자리를 만들어주도록 옆 열들을 밀어냄
  const applyShifts = (from, to, w) => {
    for (let p = 0; p < COLS; p++) {
      if (p === from) continue; // 끌고 있는 열은 손가락이 직접 제어
      let offset = 0;
      if (from < to && p > from && p <= to) offset = -w;
      else if (from > to && p >= to && p < from) offset = w;
      Animated.spring(shiftAnims[p], {
        toValue: offset,
        useNativeDriver: false,
        friction: 9,
        tension: 90,
      }).start();
    }
  };

  const resetShifts = () => {
    shiftAnims.forEach((v) => { v.stopAnimation(); v.setValue(0); });
  };

  // 화면 이동 (버튼과 메뉴가 같이 쓴다)
  const openSamin = () => router.push('/samingeom');
  const openBackup = () => router.push('/backup');

  // 메뉴 > 업데이트: 고정 링크(항상 최신 릴리스 APK)를 브라우저로 열어서 내려받게 한다
  const openUpdate = () => {
    Alert.alert(
      '최신 버전으로 업데이트',
      '최신 APK를 내려받아요.\n다운로드가 끝나면 알림이나 다운로드 폴더에서 파일을 눌러 설치하세요.\n\n지금 앱은 지우지 말고 그대로 설치하면 덮어써지고 기록은 유지돼요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '내려받기',
          onPress: () => {
            Linking.openURL(UPDATE_URL).catch(() => Alert.alert('링크를 열 수 없어요', UPDATE_URL));
          },
        },
      ]
    );
  };

  // 메뉴 > 캐릭별 레벨 수정에서 저장
  const saveLevels = async (next: (number | null)[][]) => {
    setLevels(next);
    setLevelEditOpen(false);
    await AsyncStorage.multiSet([
      [STORAGE_LEVELS_KEY, JSON.stringify(next.map((c) => c[0]))],
      [STORAGE_SUBLEVELS_KEY, JSON.stringify(next.map((c) => c.slice(1)))],
    ]);
  };

  const resetOrder = async () => {
    const defaultOrder = DEFAULT_ORDER;
    columnOrderRef.current = defaultOrder;
    setColumnOrder(defaultOrder);
    resetShifts();
    await AsyncStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(defaultOrder));
  };

  const stopAutoScroll = () => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
  };

  const cancelDrag = () => {
    clearTimeout(longPressTimer.current);
    stopAutoScroll();
    dragPosRef.current = null;
    targetPosRef.current = null;
    setDragPos(null);
    resetShifts();
  };

  // 손가락 위치 + 현재 스크롤량으로 끌고 있는 열의 위치를 다시 계산
  const updateDrag = () => {
    const from = dragPosRef.current;
    if (from === null) return;
    const w = colWidthRef.current || 1;
    const contentX = fingerXRef.current - containerLeftRef.current + scrollXRef.current;
    const dx = contentX - contentStartXRef.current;
    shiftAnims[from].setValue(dx);

    let to = from + Math.round(dx / w);
    to = Math.min(COLS - 1, Math.max(0, to));
    if (to !== targetPosRef.current) {
      targetPosRef.current = to;
      applyShifts(from, to, w);
    }
  };

  // 화면 가장자리로 끌고 가면 격자가 알아서 따라 스크롤됨
  const startAutoScroll = () => {
    stopAutoScroll();
    autoScrollTimer.current = setInterval(() => {
      if (dragPosRef.current === null) { stopAutoScroll(); return; }
      const edge = 45;
      const step = 9;
      const visible = visibleWidthRef.current;
      const maxScroll = Math.max(0, colWidthRef.current * COLS - visible);
      const fingerInView = fingerXRef.current - containerLeftRef.current;

      let next = scrollXRef.current;
      if (fingerInView < edge) next = scrollXRef.current - step;
      else if (fingerInView > visible - edge) next = scrollXRef.current + step;
      else { updateDrag(); return; }

      next = Math.min(maxScroll, Math.max(0, next));
      if (next !== scrollXRef.current) {
        scrollXRef.current = next;
        scrollRef.current?.scrollTo({ x: next, animated: false });
      }
      updateDrag();
    }, 16);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, g) => {
        const w = colWidthRef.current || 1;
        fingerXRef.current = g.x0;
        const contentX = g.x0 - containerLeftRef.current + scrollXRef.current;
        const pos = Math.min(COLS - 1, Math.max(0, Math.floor(contentX / w)));
        grantPosRef.current = pos;
        movedRef.current = false;
        longPressTimer.current = setTimeout(() => {
          dragPosRef.current = pos;
          targetPosRef.current = pos;
          contentStartXRef.current = fingerXRef.current - containerLeftRef.current + scrollXRef.current;
          setDragPos(pos);
          resetShifts();
          startAutoScroll();
        }, 300);
      },
      onPanResponderMove: (evt, g) => {
        fingerXRef.current = g.moveX;
        if (dragPosRef.current === null) {
          if (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) {
            clearTimeout(longPressTimer.current);
            movedRef.current = true;
          }
          return;
        }
        updateDrag();
      },
      onPanResponderRelease: (evt, g) => {
        clearTimeout(longPressTimer.current);
        stopAutoScroll();
        const from = dragPosRef.current;
        if (from !== null) {
          const to = targetPosRef.current !== null ? targetPosRef.current : from;
          dragPosRef.current = null;
          targetPosRef.current = null;
          setDragPos(null);
          resetShifts();
          moveColumn(from, to);
        } else if (!movedRef.current && Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
          toggleHeader(columnOrderRef.current[grantPosRef.current]);
        }
      },
      onPanResponderTerminate: () => { cancelDrag(); },
    })
  ).current;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.historyContainer}>
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            {/* 메뉴 버튼 (☰): 누르면 여러 메뉴가 열린다 */}
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setMenuOpen(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="메뉴"
            >
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>💵 정탐배럭 진행도</Text>
          </View>
          <TouchableOpacity
            style={styles.swordButton}
            onPress={openSamin}
            activeOpacity={0.7}
          >
            <Text style={styles.swordButtonText}>⚔️ 삼인검</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.todayCard}>
          <View>
            <Text style={styles.todayText}>오늘 ({todayString})</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.todayScore}>정탐 {completedCount} / {totalActiveCount}</Text>
              <Text style={styles.missionScore}>임무 {missionCount} / {COLS}</Text>
            </View>
          </View>
          {!isFinalized ? (
            <TouchableOpacity style={styles.finalizeButton} onPress={handleFinalize}>
              <Text style={styles.finalizeText}>확정하기</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleUnfinalize}>
              <Text style={styles.finalizedStatus}>✅ 확정됨</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.historyCard}>
          <View style={styles.monthBar}>
            <TouchableOpacity
              onPress={() => setMonthIndex((i) => i + 1)}
              disabled={!canOlder}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.monthArrow, !canOlder && styles.monthArrowOff]}>‹</Text>
            </TouchableOpacity>

            <Text style={styles.monthLabel}>
              {curMonth ? curMonth.year + '년 ' + curMonth.month + '월' : '기록 없음'}
            </Text>

            <TouchableOpacity
              onPress={() => setMonthIndex((i) => Math.max(0, i - 1))}
              disabled={!canNewer}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.monthArrow, !canNewer && styles.monthArrowOff]}>›</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {(curMonth ? curMonth.items : []).map((item, index) => (
            <View key={index} style={styles.historyRow}>
              <Text style={styles.historyDate}>{item.date}</Text>
              <View style={styles.historyScores}>
                <Text style={styles.historyScore}>정탐 {item.completed} / {item.total}</Text>
                {item.mission !== undefined && (
                  <Text style={styles.historyMission}>임무 {item.mission} / {item.missionTotal}</Text>
                )}
              </View>
            </View>
          ))}
          </ScrollView>
        </View>

        <View style={styles.resetRow}>
          <TouchableOpacity style={styles.resetButton} onPress={resetOrder} activeOpacity={0.7}>
            <Text style={styles.resetIcon}>↺</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.resetButton, styles.backupButton]}
            onPress={openBackup}
            activeOpacity={0.7}
          >
            <Text style={styles.backupIcon}>💾</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={styles.gridContainer}
        onLayout={(e) => {
          const { x, width } = e.nativeEvent.layout;
          const inner = width - 20;
          colWidthRef.current = inner / VISIBLE_COLS;
          containerLeftRef.current = x + 10;
          visibleWidthRef.current = inner;
          setCellSize(inner / VISIBLE_COLS);
        }}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => { scrollXRef.current = e.nativeEvent.contentOffset.x; }}
        >
        <View style={[styles.gridBody, { width: cellSize * COLS }]}>
          {columnOrder.map((colId, pos) => {
            const isDragging = dragPos === pos;
            return (
              <Animated.View
                key={colId}
                style={[
                  styles.column,
                  { width: cellSize },
                  pos % 2 === 1 && pos < COLS - 1 && styles.borderRightThick,
                  isDragging && styles.columnDragging,
                  { transform: [{ translateX: shiftAnims[pos] }] },
                ]}
              >
                {/* 접속 체크 줄 (맨 왼쪽 칸에 흐릿하게 '접속') */}
                <TouchableOpacity
                  style={[styles.missionCell, { height: missionH }]}
                  disabled={isFinalized}
                  activeOpacity={0.6}
                  onPress={() => toggleLogin(colId)}
                >
                  <View style={styles.checkInner}>
                    {pos === 0 && <Text style={styles.rowTag}>접속</Text>}
                    {loginState[colId] && (
                      <Text style={[styles.missionCheck, { fontSize: missionH * 0.72 }]}>✓</Text>
                    )}
                  </View>
                </TouchableOpacity>

                {/* 미션 체크 줄 (맨 왼쪽 칸에 흐릿하게 '미션') */}
                <TouchableOpacity
                  style={[styles.missionCell, { height: missionH }]}
                  disabled={isFinalized}
                  activeOpacity={0.6}
                  onPress={() => toggleMission(colId)}
                >
                  <View style={styles.checkInner}>
                    {pos === 0 && <Text style={styles.rowTag}>미션</Text>}
                    {missionState[colId] && (
                      <Text style={[styles.missionCheck, { fontSize: missionH * 0.72 }]}>✓</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <View style={[styles.headerCell, { height: cellSize }]}>
                  <View style={[styles.headerBadge, headerState[colId] && styles.headerBadgeActive]}>
                    <Text style={[styles.headerText, headerState[colId] && styles.headerTextActive]}>
                      {HEADERS[colId]}
                    </Text>
                  </View>
                </View>

                {Array.from({ length: ROWS }).map((_, rowIndex) => {
                  const isDone = gridState[rowIndex][colId];
                  const isActive = rowIndex < ACTIVE_LIMITS[colId];
                  const isSpecial = isSpecialCell(rowIndex, colId);
                  const isDisabled = !isActive && !isSpecial;
                  const level = levels[colId][rowIndex] ?? null;

                  return (
                    <TouchableOpacity
                      key={rowIndex}
                      disabled={isFinalized || isDisabled}
                      style={[
                        styles.cell,
                        { height: cellSize },
                        isDisabled ? styles.disabledBg : (
                          isSpecial ? (isDone ? styles.specialDoneBg : styles.specialPendingBg)
                            : (isDone ? styles.doneBg : styles.pendingBg)
                        )
                      ]}
                      onPress={() => toggleButton(rowIndex, colId)}
                    >
                      {isHighlightCell(rowIndex, colId) && <View style={styles.firstCellHighlight} pointerEvents="none" />}
                      <Text style={styles.cellLabel} numberOfLines={1}>
                        {SUB_LABELS[colId][rowIndex].split('').join(' ')}
                      </Text>
                      {level !== null && (
                        <Text style={[styles.cellLevel, level >= HIGH_LEVEL && styles.cellLevelHigh]} numberOfLines={1}>{level}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            );
          })}

          {/* 헤더 줄 위에 얹은 투명 레이어: 탭 = 뱃지 토글, 길게 누르고 끌기 = 열 이동 */}
          <View
            style={[styles.dragLayer, { top: missionH * 2, height: cellSize, width: cellSize * COLS }]}
            {...panResponder.panHandlers}
          />
        </View>
        </ScrollView>
      </View>

      <MainMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          { key: 'levels', label: '📈 캐릭별 레벨 수정', onPress: () => setLevelEditOpen(true) },
          { key: 'update', label: '⬆️ 최신 버전으로 업데이트', onPress: openUpdate },
        ]}
      />

      <LevelEditor
        visible={levelEditOpen}
        headers={HEADERS}
        names={SUB_LABELS.map((r) => r.map((n) => (n === '★' ? '★들숨' : n)))} // ★ 칸은 메인 캐릭 '들숨'
        order={columnOrder}
        levels={levels}
        highLevel={HIGH_LEVEL}
        onClose={() => setLevelEditOpen(false)}
        onSave={saveLevels}
      />
    </SafeAreaView>
  );
}

const CELL_HEIGHT = 45;
const HEADER_HEIGHT = 45;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  historyContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  titleLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  menuButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 8, elevation: 2 },
  menuLine: { width: 15, height: 2, borderRadius: 1, backgroundColor: '#4b5563', marginVertical: 1.5 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  swordButton: { backgroundColor: '#fff', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 18, elevation: 2 },
  swordButtonText: { fontSize: 13, fontWeight: 'bold', color: '#6c5ce7' },
  todayCard: { backgroundColor: '#fff', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, elevation: 3 },
  todayText: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginBottom: 5 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  todayScore: { fontSize: 16, fontWeight: '900', color: '#4caf50' },
  missionScore: { fontSize: 16, fontWeight: '900', color: '#6c5ce7', marginLeft: 12 },
  finalizeButton: { backgroundColor: '#6c5ce7', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  finalizeText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  finalizedStatus: { color: '#636e72', fontWeight: 'bold', fontSize: 16, padding: 10 },
  historyCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 15, paddingTop: 6, elevation: 2 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  monthLabel: { fontSize: 15, fontWeight: 'bold', color: '#2c3e50' },
  monthArrow: { fontSize: 22, fontWeight: 'bold', color: '#6c5ce7', paddingHorizontal: 16, lineHeight: 26 },
  monthArrowOff: { color: '#dcdde1' },
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  historyDate: { fontSize: 16, color: '#555' },
  historyScores: { flexDirection: 'row', alignItems: 'baseline' },
  historyScore: { fontSize: 15, color: '#777', fontWeight: 'bold' },
  historyMission: { fontSize: 15, color: '#8c7ae6', fontWeight: 'bold', marginLeft: 10 },

  resetRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 6 },
  backupButton: { marginLeft: 14 },
  backupIcon: { fontSize: 16, lineHeight: 22 },
  resetButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 2 },
  resetIcon: { fontSize: 18, color: '#636e72', fontWeight: 'bold', lineHeight: 22 },

  gridContainer: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 10 },
  gridBody: { flexDirection: 'row' },
  column: {},
  columnDragging: { zIndex: 10, opacity: 0.9 },

  cell: { width: '100%', height: CELL_HEIGHT, borderWidth: 0.5, borderColor: '#d1d8e0', justifyContent: 'center', alignItems: 'center' },
  headerCell: { width: '100%', backgroundColor: '#fff', height: HEADER_HEIGHT, borderWidth: 0.5, borderColor: '#d1d8e0', justifyContent: 'center', alignItems: 'center' },

  missionCell: { width: '100%', backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#d1d8e0', justifyContent: 'center', alignItems: 'center' },
  missionCheck: { color: '#2d9c5a', fontWeight: '900' },

  cellLabel: { fontSize: 9, color: '#5b6470', fontWeight: '600', textAlign: 'center' },
  cellLevel: { fontSize: 8, color: '#7b8696', fontWeight: '500', textAlign: 'center', marginTop: 1 },
  cellLevelHigh: { color: '#000', fontWeight: '800' },

  // 접속/미션 줄의 맨 왼쪽 칸 이름표 (체크 표시와 나란히 놓이고, 흐릿하게)
  checkInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rowTag: { fontSize: 8, color: '#c3cad4', marginRight: 2 },

  headerBadge: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  headerBadgeActive: { backgroundColor: '#ffeaa7', borderWidth: 1, borderColor: '#fdcb6e' },
  headerText: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  headerTextActive: { color: '#d63031', fontWeight: '900' },

  borderRightThick: { borderRightWidth: 2, borderRightColor: '#2c3e50' },
  firstCellHighlight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: '#2c3e50', borderRadius: 4 },

  dragLayer: { position: 'absolute', left: 0, right: 0, height: HEADER_HEIGHT, zIndex: 20 },

  pendingBg: { backgroundColor: '#ffb8b8' },
  doneBg: { backgroundColor: '#a8e6cf' },
  specialPendingBg: { backgroundColor: '#ffeaa7' },
  specialDoneBg: { backgroundColor: '#74b9ff' },
  disabledBg: { backgroundColor: '#f1f2f6' }
});
