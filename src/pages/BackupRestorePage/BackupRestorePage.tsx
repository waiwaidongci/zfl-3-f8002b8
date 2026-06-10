import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileJson,
  Trash2,
  Database,
  AlertCircle,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { useBenchStore } from '@/store/useBenchStore';
import { MAX_IMPORT_FILE_SIZE, type ValidationResult, type ValidationError } from '@/utils/storage';

type ImportStage = 'idle' | 'parsing' | 'preview' | 'success' | 'error';

interface PreviewData {
  validation: ValidationResult;
  overwritingIds: string[];
  newIds: string[];
  keptCount: number;
  fileName: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function BackupRestorePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);
  const {
    benches,
    exportData,
    validateImportData,
    importBenches,
    initialize,
    initialized,
    clearAllData,
  } = useBenchStore();

  const [importStage, setImportStage] = useState<ImportStage>('idle');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    overwrittenCount: number;
    newCount: number;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  const processFile = useCallback((file: File) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json' && file.type !== '') {
      setErrorMessage('文件类型错误：请选择 .json 格式的文件');
      setImportStage('error');
      return;
    }

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setErrorMessage(`文件过大：${formatFileSize(file.size)}，最大允许 ${formatFileSize(MAX_IMPORT_FILE_SIZE)}`);
      setImportStage('error');
      return;
    }

    setImportStage('parsing');
    setErrorMessage('');
    setPreviewData(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        const validation = validateImportData(parsed);

        const existingIds = new Set(benches.map((b) => b.id));
        const overwritingIds = validation.validBenches
          .filter((b) => existingIds.has(b.id))
          .map((b) => b.id);
        const newIds = validation.validBenches
          .filter((b) => !existingIds.has(b.id))
          .map((b) => b.id);
        const keptCount = benches.length - overwritingIds.length;

        setPreviewData({
          validation,
          overwritingIds,
          newIds,
          keptCount,
          fileName: file.name,
        });
        setImportStage('preview');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        setErrorMessage(`文件解析失败：JSON 格式不正确。\n${msg}`);
        setImportStage('error');
      }
    };
    reader.onerror = () => {
      setErrorMessage('文件读取失败，请重试。');
      setImportStage('error');
    };
    reader.readAsText(file);
  }, [benches, validateImportData]);

  const handleExport = () => {
    exportData();
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleConfirmImport = () => {
    if (!previewData) return;

    const { validBenches } = previewData.validation;
    if (validBenches.length === 0) {
      setErrorMessage('没有有效的长椅数据可以导入。');
      setImportStage('error');
      return;
    }

    const result = importBenches(validBenches);
    setImportResult({
      importedCount: result.importedCount,
      overwrittenCount: result.overwrittenCount,
      newCount: previewData.newIds.length,
    });
    setImportStage('success');
  };

  const handleReset = () => {
    setImportStage('idle');
    setPreviewData(null);
    setErrorMessage('');
    setImportResult(null);
  };

  const handleClearData = () => {
    clearAllData();
    setShowClearConfirm(false);
    setClearSuccess(true);
    setTimeout(() => setClearSuccess(false), 3000);
  };

  const groupedErrors = previewData
    ? previewData.validation.errors.reduce((acc, err) => {
        const key = err.index === -1 ? '全局' : `第 ${err.index + 1} 条记录`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(err);
        return acc;
      }, {} as Record<string, ValidationError[]>)
    : {};

  const groupedWarnings = previewData
    ? previewData.validation.warnings.reduce((acc, warn) => {
        const key = warn.index === -1 ? '全局' : `第 ${warn.index + 1} 条记录`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(warn);
        return acc;
      }, {} as Record<string, ValidationError[]>)
    : {};

  const totalExperiences = benches.reduce((sum, b) => sum + (b.experiences?.length || 0), 0);

  return (
    <div className="container mx-auto px-4 py-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-ink-light hover:text-deep-brown mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">返回</span>
      </button>

      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-deep-brown mb-6">
          数据备份与恢复
        </h1>

        {clearSuccess && (
          <div className="mb-6 p-4 bg-moss-green/10 border border-moss-green/30 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-moss-green" />
            <span className="text-sm text-moss-green font-medium">
              已清空所有长椅档案
            </span>
          </div>
        )}

        <div className="space-y-6">
          <div className="paper-texture rounded-xl shadow-paper p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-moss-green/10 flex items-center justify-center shrink-0">
                <Download className="w-6 h-6 text-moss-green" />
              </div>
              <div className="flex-1">
                <h2 className="font-serif text-lg font-semibold text-deep-brown mb-1">
                  导出数据
                </h2>
                <p className="text-sm text-ink-light mb-4">
                  将当前所有长椅档案导出为 JSON 文件，包含完整的数据结构与体验记录。
                  当前共有 <span className="font-medium text-deep-brown">{benches.length}</span> 条档案，
                  <span className="font-medium text-deep-brown"> {totalExperiences}</span> 条体验记录。
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-moss-green text-white rounded-lg font-medium text-sm hover:bg-moss-light transition-colors shadow-md hover:shadow-lg"
                  >
                    <Download className="w-4 h-4" />
                    导出 JSON 文件
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="paper-texture rounded-xl shadow-paper p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-ochre/10 flex items-center justify-center shrink-0">
                <Upload className="w-6 h-6 text-ochre" />
              </div>
              <div className="flex-1">
                <h2 className="font-serif text-lg font-semibold text-deep-brown mb-1">
                  导入数据
                </h2>
                <p className="text-sm text-ink-light mb-4">
                  从 JSON 文件恢复长椅档案。导入前会展示数据预览、异常字段与覆盖提示，
                  确认后才会写入存储。单文件最大 {formatFileSize(MAX_IMPORT_FILE_SIZE)}。
                </p>

                {importStage === 'idle' && (
                  <div
                    ref={dropAreaRef}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleFileSelect}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      isDragOver
                        ? 'border-ochre bg-ochre/10'
                        : 'border-deep-brown/20 hover:border-ochre/50 hover:bg-warm-cream/40'
                    }`}
                  >
                    <Upload className="w-10 h-10 mx-auto mb-3 text-ochre" />
                    <p className="text-sm font-medium text-deep-brown mb-1">
                      点击选择文件，或将 JSON 文件拖放至此处
                    </p>
                    <p className="text-xs text-ink-light">
                      支持 .json 格式，最大 {formatFileSize(MAX_IMPORT_FILE_SIZE)}
                    </p>
                  </div>
                )}

                {importStage === 'parsing' && (
                  <div className="flex items-center gap-2 text-sm text-ink-light">
                    <div className="w-4 h-4 border-2 border-ochre border-t-transparent rounded-full animate-spin" />
                    正在解析与校验文件...
                  </div>
                )}

                {importStage === 'preview' && previewData && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-ink-light mb-2">
                      <FileJson className="w-4 h-4 text-ochre" />
                      <span className="font-medium text-deep-brown">{previewData.fileName}</span>
                    </div>

                    <div className="p-4 bg-warm-cream/60 rounded-lg border border-deep-brown/10">
                      <div className="flex items-center gap-2 mb-3">
                        <Eye className="w-5 h-5 text-ochre" />
                        <span className="font-medium text-deep-brown">导入预览</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-ink-light text-xs mb-0.5">文件内记录</p>
                          <p className="text-deep-brown font-semibold text-lg">
                            {previewData.validation.totalCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-ink-light text-xs mb-0.5">有效记录</p>
                          <p className={`font-semibold text-lg ${
                            previewData.validation.validBenches.length > 0
                              ? 'text-moss-green'
                              : 'text-red-500'
                          }`}>
                            {previewData.validation.validBenches.length}
                          </p>
                        </div>
                        <div>
                          <p className="text-ink-light text-xs mb-0.5">新增记录</p>
                          <p className="font-semibold text-lg text-moss-green">
                            {previewData.newIds.length}
                          </p>
                        </div>
                        <div>
                          <p className="text-ink-light text-xs mb-0.5">覆盖原有</p>
                          <p className={`font-semibold text-lg ${
                            previewData.overwritingIds.length > 0
                              ? 'text-ochre'
                              : 'text-ink-light'
                          }`}>
                            {previewData.overwritingIds.length}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-deep-brown/10 text-xs text-ink-light">
                        导入后共保留 <span className="font-medium text-deep-brown">
                          {previewData.keptCount + previewData.newIds.length}
                        </span> 条档案（原有保留 {previewData.keptCount} 条 + 新增 {previewData.newIds.length} 条）
                      </div>
                    </div>

                    {previewData.validation.autoFixedCount > 0 && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-start gap-2">
                          <RefreshCw className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-blue-700 text-sm">
                              自动修正 {previewData.validation.autoFixedCount} 处数据
                            </p>
                            <p className="text-xs text-blue-500/80">
                              部分字段存在小问题已自动修复，可在下方警告中查看详情。
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {previewData.overwritingIds.length > 0 && (
                      <div className="p-4 bg-ochre/10 rounded-lg border border-ochre/30">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-5 h-5 text-ochre shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium text-deep-brown text-sm mb-1">
                              注意：将覆盖现有数据
                            </p>
                            <p className="text-xs text-ink-light">
                              检测到 {previewData.overwritingIds.length} 条记录的 ID 与现有档案重复，
                              导入后这些档案将被新数据覆盖。
                            </p>
                            <div className="mt-2 max-h-24 overflow-y-auto">
                              {previewData.overwritingIds.slice(0, 5).map((id) => {
                                const bench = benches.find((b) => b.id === id);
                                return (
                                  <div key={id} className="text-xs text-ink-light py-0.5">
                                    • {bench?.name || id}
                                  </div>
                                );
                              })}
                              {previewData.overwritingIds.length > 5 && (
                                <div className="text-xs text-ink-light/70 mt-1">
                                  ...还有 {previewData.overwritingIds.length - 5} 条
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {Object.keys(groupedWarnings).length > 0 && (
                      <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="flex items-start gap-2 mb-2">
                          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-amber-700 text-sm">
                              {previewData.validation.warnings.length} 条警告（已自动修复）
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-2">
                          {Object.entries(groupedWarnings).map(([group, warns]) => (
                            <div key={group} className="text-xs">
                              <p className="font-medium text-amber-600 mb-1">{group}</p>
                              <ul className="space-y-0.5 ml-3">
                                {warns.map((warn, idx) => (
                                  <li key={idx} className="text-amber-600/90">
                                    <span className="text-amber-500">{warn.field}</span>：{warn.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {previewData.validation.errors.length > 0 && (
                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex items-start gap-2 mb-2">
                          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-red-700 text-sm">
                              发现 {previewData.validation.errors.length} 处数据异常
                            </p>
                            <p className="text-xs text-red-500/80">
                              包含异常字段的记录将被跳过，不会被导入。
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                          {Object.entries(groupedErrors).map(([group, errs]) => (
                            <div key={group} className="text-xs">
                              <p className="font-medium text-red-600 mb-1">{group}</p>
                              <ul className="space-y-0.5 ml-3">
                                {errs.map((err, idx) => (
                                  <li key={idx} className="text-red-500/90">
                                    <span className="text-red-400">{err.field}</span>：{err.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleReset}
                        className="flex-1 px-5 py-2.5 bg-warm-beige text-deep-brown rounded-lg font-medium text-sm hover:bg-warm-beige/80 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleConfirmImport}
                        disabled={previewData.validation.validBenches.length === 0}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-ochre text-white rounded-lg font-medium text-sm hover:bg-ochre-light transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Database className="w-4 h-4" />
                        确认导入 {previewData.validation.validBenches.length} 条
                      </button>
                    </div>
                  </div>
                )}

                {importStage === 'success' && importResult && (
                  <div className="space-y-4">
                    <div className="p-4 bg-moss-green/10 rounded-lg border border-moss-green/30">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="w-5 h-5 text-moss-green" />
                        <p className="font-medium text-moss-green">
                          导入成功！
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-ink-light text-xs mb-0.5">成功导入</p>
                          <p className="text-deep-brown font-semibold text-lg">
                            {importResult.importedCount} 条
                          </p>
                        </div>
                        <div>
                          <p className="text-ink-light text-xs mb-0.5">新增记录</p>
                          <p className="text-deep-brown font-semibold text-lg text-moss-green">
                            {importResult.newCount} 条
                          </p>
                        </div>
                        <div>
                          <p className="text-ink-light text-xs mb-0.5">覆盖原有</p>
                          <p className="text-deep-brown font-semibold text-lg text-ochre">
                            {importResult.overwrittenCount} 条
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleReset}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-warm-beige text-deep-brown rounded-lg font-medium text-sm hover:bg-warm-beige/80 transition-colors"
                    >
                      再次导入
                    </button>
                  </div>
                )}

                {importStage === 'error' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-start gap-2">
                        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-700 text-sm mb-1">
                            导入失败
                          </p>
                          <p className="text-xs text-red-500/90 whitespace-pre-line">
                            {errorMessage || '发生未知错误，请检查文件格式后重试。'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleReset}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-warm-beige text-deep-brown rounded-lg font-medium text-sm hover:bg-warm-beige/80 transition-colors"
                    >
                      重新选择文件
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          <div className="paper-texture rounded-xl shadow-paper p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div className="flex-1">
                <h2 className="font-serif text-lg font-semibold text-deep-brown mb-1">
                  清空数据
                </h2>
                <p className="text-sm text-ink-light mb-4">
                  所有长椅档案数据保存在浏览器本地存储（localStorage）中。
                  建议定期导出备份，以防清理浏览器数据导致档案丢失。
                  导入操作采用合并策略：ID 相同的记录会被覆盖，ID 不同的记录会保留。
                </p>

                {!showClearConfirm ? (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    disabled={benches.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-medium text-sm hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    清空所有档案
                  </button>
                ) : (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm text-red-700 mb-3">
                      确定要清空全部 {benches.length} 条长椅档案吗？此操作不可恢复。
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearData}
                        className="px-4 py-1.5 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-colors"
                      >
                        确认清空
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="px-4 py-1.5 bg-warm-beige text-deep-brown rounded-md text-sm font-medium hover:bg-warm-beige/80 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
