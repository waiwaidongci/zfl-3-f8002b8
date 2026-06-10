import type { Bench, BenchExperience, MaterialType, OrientationType, ShadeLevelType, NoiseLevelType, StayDurationType, TimePeriodType } from '@/types';

const STORAGE_KEY = 'bench-archive-data';
export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

const VALID_MATERIALS: MaterialType[] = ['wood', 'metal', 'stone', 'plastic', 'mixed'];
const VALID_ORIENTATIONS: OrientationType[] = ['east', 'south', 'west', 'north', 'southeast', 'northeast', 'southwest', 'northwest'];
const VALID_SHADE_LEVELS: ShadeLevelType[] = ['none', 'partial', 'full'];
const VALID_NOISE_LEVELS: NoiseLevelType[] = ['quiet', 'moderate', 'noisy'];
const VALID_STAY_DURATIONS: StayDurationType[] = ['short', 'medium', 'long', 'verylong'];
const VALID_TIME_PERIODS: TimePeriodType[] = ['morning', 'noon', 'afternoon', 'evening', 'night'];

export interface ValidationError {
  index: number;
  field: string;
  message: string;
  severity?: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  validBenches: Bench[];
  totalCount: number;
  warnings: ValidationError[];
  autoFixedCount: number;
}

export function loadBenches(): Bench[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load benches from localStorage:', error);
  }
  return [];
}

export function saveBenches(benches: Bench[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(benches));
  } catch (error) {
    console.error('Failed to save benches to localStorage:', error);
  }
}

export function clearBenches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear benches from localStorage:', error);
  }
}

export function exportBenchesToJSON(benches: Bench[]): string {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: benches.length,
    benches,
  };
  return JSON.stringify(exportData, null, 2);
}

export function downloadJSONFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface ExperienceValidationResult {
  errors: ValidationError[];
  warnings: ValidationError[];
  fixedExperience?: BenchExperience;
}

function validateBenchExperience(
  exp: unknown,
  benchIndex: number,
  expIndex: number,
  parentBenchId: string
): ExperienceValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const e = exp as Record<string, unknown>;

  if (!e || typeof e !== 'object') {
    errors.push({ index: benchIndex, field: `experiences[${expIndex}]`, message: '体验记录必须是对象', severity: 'error' });
    return { errors, warnings };
  }

  let benchIdFixed = false;
  const fixedExp = { ...e } as Record<string, unknown>;

  if (typeof e.id !== 'string' || e.id.trim() === '') {
    errors.push({ index: benchIndex, field: `experiences[${expIndex}].id`, message: '体验ID不能为空', severity: 'error' });
  }

  if (typeof e.benchId !== 'string' || e.benchId.trim() === '') {
    errors.push({ index: benchIndex, field: `experiences[${expIndex}].benchId`, message: '关联长椅ID不能为空', severity: 'error' });
  } else if (e.benchId !== parentBenchId) {
    warnings.push({
      index: benchIndex,
      field: `experiences[${expIndex}].benchId`,
      message: `体验记录的 benchId(${String(e.benchId)}) 与所属长椅 ID(${parentBenchId}) 不一致，已自动修正`,
      severity: 'warning',
    });
    fixedExp.benchId = parentBenchId;
    benchIdFixed = true;
  }

  if (!VALID_TIME_PERIODS.includes(e.timePeriod as TimePeriodType)) {
    errors.push({
      index: benchIndex,
      field: `experiences[${expIndex}].timePeriod`,
      message: `时间段无效，应为: ${VALID_TIME_PERIODS.join(', ')}`,
      severity: 'error',
    });
  }

  if (typeof e.notes !== 'string') {
    errors.push({ index: benchIndex, field: `experiences[${expIndex}].notes`, message: '备注必须是字符串', severity: 'error' });
  }

  if (typeof e.rating !== 'number' || e.rating < 0 || e.rating > 5) {
    errors.push({ index: benchIndex, field: `experiences[${expIndex}].rating`, message: '评分必须是0-5之间的数字', severity: 'error' });
  }

  return {
    errors,
    warnings,
    fixedExperience: benchIdFixed ? (fixedExp as unknown as BenchExperience) : undefined,
  };
}

export function validateBenchesData(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const validBenches: Bench[] = [];
  let autoFixedCount = 0;

  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: [{ index: -1, field: 'root', message: '数据格式无效，必须是JSON对象', severity: 'error' }],
      validBenches: [],
      totalCount: 0,
      warnings: [],
      autoFixedCount: 0,
    };
  }

  let benchesArray: unknown[];
  if (Array.isArray(data)) {
    benchesArray = data;
  } else if ('benches' in data && Array.isArray((data as Record<string, unknown>).benches)) {
    benchesArray = (data as Record<string, unknown>).benches as unknown[];
  } else {
    return {
      valid: false,
      errors: [{ index: -1, field: 'root', message: '未找到benches数组，数据格式不正确', severity: 'error' }],
      validBenches: [],
      totalCount: 0,
      warnings: [],
      autoFixedCount: 0,
    };
  }

  const totalCount = benchesArray.length;

  benchesArray.forEach((item, index) => {
    const bench = item as Record<string, unknown>;
    const benchErrors: ValidationError[] = [];
    const benchWarnings: ValidationError[] = [];
    let benchAutoFixed = 0;
    let experiencesFixed: BenchExperience[] | null = null;

    if (!bench || typeof bench !== 'object') {
      errors.push({ index, field: 'root', message: '长椅数据必须是对象', severity: 'error' });
      return;
    }

    if (typeof bench.id !== 'string' || bench.id.trim() === '') {
      benchErrors.push({ index, field: 'id', message: 'ID不能为空', severity: 'error' });
    }

    const parentBenchId = typeof bench.id === 'string' ? bench.id : '';

    if (typeof bench.name !== 'string' || bench.name.trim() === '') {
      benchErrors.push({ index, field: 'name', message: '名称不能为空', severity: 'error' });
    }

    if (typeof bench.location !== 'string' || bench.location.trim() === '') {
      benchErrors.push({ index, field: 'location', message: '位置不能为空', severity: 'error' });
    }

    if (typeof bench.lat !== 'number' || isNaN(bench.lat) || bench.lat < -90 || bench.lat > 90) {
      benchErrors.push({ index, field: 'lat', message: '纬度必须是-90到90之间的有效数字', severity: 'error' });
    }

    if (typeof bench.lng !== 'number' || isNaN(bench.lng) || bench.lng < -180 || bench.lng > 180) {
      benchErrors.push({ index, field: 'lng', message: '经度必须是-180到180之间的有效数字', severity: 'error' });
    }

    if (!VALID_MATERIALS.includes(bench.material as MaterialType)) {
      benchErrors.push({ index, field: 'material', message: `材质无效，应为: ${VALID_MATERIALS.join(', ')}`, severity: 'error' });
    }

    if (!VALID_ORIENTATIONS.includes(bench.orientation as OrientationType)) {
      benchErrors.push({ index, field: 'orientation', message: `朝向无效，应为: ${VALID_ORIENTATIONS.join(', ')}`, severity: 'error' });
    }

    if (typeof bench.hasBackrest !== 'boolean') {
      benchErrors.push({ index, field: 'hasBackrest', message: '是否有靠背必须是布尔值', severity: 'error' });
    }

    if (!VALID_SHADE_LEVELS.includes(bench.shadeLevel as ShadeLevelType)) {
      benchErrors.push({ index, field: 'shadeLevel', message: `遮阴等级无效，应为: ${VALID_SHADE_LEVELS.join(', ')}`, severity: 'error' });
    }

    if (!VALID_NOISE_LEVELS.includes(bench.noiseLevel as NoiseLevelType)) {
      benchErrors.push({ index, field: 'noiseLevel', message: `噪音等级无效，应为: ${VALID_NOISE_LEVELS.join(', ')}`, severity: 'error' });
    }

    if (!VALID_STAY_DURATIONS.includes(bench.stayDuration as StayDurationType)) {
      benchErrors.push({ index, field: 'stayDuration', message: `停留时长无效，应为: ${VALID_STAY_DURATIONS.join(', ')}`, severity: 'error' });
    }

    if (typeof bench.rating !== 'number' || isNaN(bench.rating) || bench.rating < 0 || bench.rating > 5) {
      benchErrors.push({ index, field: 'rating', message: '评分必须是0-5之间的数字', severity: 'error' });
    }

    if (typeof bench.review !== 'string') {
      benchErrors.push({ index, field: 'review', message: '评价必须是字符串', severity: 'error' });
    }

    if (typeof bench.createdAt !== 'string' || isNaN(Date.parse(bench.createdAt))) {
      benchErrors.push({ index, field: 'createdAt', message: '创建时间格式无效', severity: 'error' });
    }

    if (typeof bench.updatedAt !== 'string' || isNaN(Date.parse(bench.updatedAt))) {
      benchErrors.push({ index, field: 'updatedAt', message: '更新时间格式无效', severity: 'error' });
    }

    if (!Array.isArray(bench.experiences)) {
      benchErrors.push({ index, field: 'experiences', message: '体验记录必须是数组', severity: 'error' });
    } else {
      const processedExperiences: BenchExperience[] = [];
      let anyExpFixed = false;

      (bench.experiences as unknown[]).forEach((exp, expIdx) => {
        const result = validateBenchExperience(exp, index, expIdx, parentBenchId);
        benchErrors.push(...result.errors);
        benchWarnings.push(...result.warnings);

        if (result.fixedExperience) {
          processedExperiences.push(result.fixedExperience);
          anyExpFixed = true;
          benchAutoFixed++;
        } else if (result.errors.length === 0) {
          processedExperiences.push(exp as BenchExperience);
        }
      });

      if (anyExpFixed) {
        experiencesFixed = processedExperiences;
      }
    }

    if (benchErrors.length === 0) {
      let finalBench = bench as unknown as Bench;
      if (experiencesFixed) {
        finalBench = { ...finalBench, experiences: experiencesFixed };
      }
      validBenches.push(finalBench);
      autoFixedCount += benchAutoFixed;
    }

    errors.push(...benchErrors);
    warnings.push(...benchWarnings);
  });

  return {
    valid: errors.length === 0,
    errors,
    validBenches,
    totalCount,
    warnings,
    autoFixedCount,
  };
}
