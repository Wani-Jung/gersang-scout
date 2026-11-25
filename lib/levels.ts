// 캐릭 레벨 관련 순수 함수 (화면과 분리해서 시험하기 쉽게 둔다)

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 999;

const isLevel = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= LEVEL_MIN && v <= LEVEL_MAX;

/**
 * 폰에 저장된 값(모양을 믿을 수 없음)을 계정 수만큼의 [숫자 | null] 배열로 맞춘다.
 * - 저장된 값이 배열이 아니면 기본값 그대로
 * - 칸이 null 이면 '표시 안 함'으로 존중
 * - 칸이 없거나 이상한 값이면 그 칸만 기본값
 */
export function normalizeLevels(raw: unknown, defaults: (number | null)[]): (number | null)[] {
  if (!Array.isArray(raw)) return [...defaults];
  return defaults.map((d, i) => {
    const v = raw[i];
    if (v === null) return null;
    return isLevel(v) ? v : d;
  });
}

/** 입력칸 글자 → 레벨. 빈칸이면 null(표시 안 함), 숫자가 아니거나 범위를 벗어나면 undefined(잘못된 입력). */
export function parseLevel(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,3}$/.test(t)) return undefined;
  const n = Number(t);
  return isLevel(n) ? n : undefined;
}
