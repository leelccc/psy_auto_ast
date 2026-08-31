import { StatusBar } from "expo-status-bar";
import NativeDateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  RecordingPresets,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ChartNoAxesColumn,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  FileText,
  FolderOpen,
  History,
  Home,
  LockKeyhole,
  LogOut,
  Mic,
  Newspaper,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Trash2,
  UserRound,
} from "lucide-react-native";
import { Component, createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  SafeAreaView,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
  ScrollView,
  StatusBar as NativeStatusBar,
  LogBox,
  BackHandler,
  Linking,
} from "react-native";

import { buildArchiveResult, describeArchiveTarget, filterArchiveCandidates, type ArchiveKind } from "./src/archiveFlow";
import {
  displayProfileCode,
  filterProfiles,
  normalizeProfileCodeInput,
  suggestedProfileCode,
  type ProfileFilter,
  type ProfileListItem,
} from "./src/profileLibrary";
import { ApiClient, ApiError } from "./src/api/apiClient";
import { configuredApiBaseUrl } from "./src/api/apiConfig";
import { createAuthService, type CurrentUser } from "./src/api/authService";
import { createAttachmentService, type ProfileAttachment } from "./src/api/attachmentService";
import { createBackendFileService } from "./src/api/fileService";
import { createProfileAccessService } from "./src/api/profileAccessService";
import { createProfileService } from "./src/api/profileService";
import { createRecordingService, type Recording, type RecordingDurationStatistics } from "./src/api/recordingService";
import { createJobService, type AIJob } from "./src/api/jobService";
import { createReportService, type Report, type ReportSource } from "./src/api/reportService";
import {
  createPrivacyService,
  type ExpiringByProfileItem,
  type PrivacyCategoryKey,
  type PrivacyResourceItem,
  type ProfilePrivacyPage,
  type SensitiveResource,
} from "./src/api/privacyService";
import { createCalendarService, type CalendarEvent } from "./src/api/calendarService";
import { createSupervisionService, type SupervisionConversation } from "./src/api/supervisionService";
import { createSessionService } from "./src/api/sessionService";
import { createDeviceAuthSessionStore } from "./src/native/deviceAuthSession";
import { pickLocalFile } from "./src/native/filePicker";
import { downloadAndShareFile, uploadLocalFile } from "./src/native/fileTransfer";
import {
  createAudioRecordingController,
  createExpoAudioDriver,
  recordingMimeType,
  toRecordedLocalFile,
  type RecordedLocalAudio,
} from "./src/native/audioRecording";
import { getLocalAudioDurationSeconds } from "./src/native/audioMetadata";
import { configureAudioPlaybackMode, safelyPauseAudioPlayer, toggleAudioPlayback } from "./src/native/audioPlayback";
import {
  createExpoCalendarDriver,
  syncCalendarEvent,
} from "./src/native/calendarSync";
import {
  describeRecordingContext,
  findRecordingForSession,
  getRecordingDestination,
  recordingAudioCanProcess,
  recordingDetailRequiresProfileUnlock,
  toArchiveRecording,
  waitForRecordingJob,
  type ArchiveRecording,
} from "./src/recordingFlow";
import { buildDownloadArtifact, downloadSummaryPdf } from "./src/downloadFlow";
import {
  getOriginalFileDownloadState,
  type StoredFileReference,
} from "./src/fileService";
import { decideRecordingRegeneration, updateAtIndex } from "./src/recordingEditorFlow";
import { dateFromDateTimeInput, formatDateTimeInput, normalizeSessionDate } from "./src/dateTimeInput";
import {
  keepReportGenerationLoadError,
  retryReportGenerationLoad,
} from "./src/reportGenerationFlow";
import WebDatePicker from "./src/WebDatePicker";
import {
  getMaterialUpdateMessage,
  materialCategoryCopy,
  removeSessionMaterial,
  type MaterialCategory,
  type SessionMaterial,
} from "./src/sessionMaterials";
import {
  addSessionTag,
  applySessionResourceStatuses,
  applySessionReportStatuses,
  formatSessionTime,
  type SessionHistoryItem,
} from "./src/sessionHistory";
import {
  calendarSettingSummary,
  caseReportDownloadNotice,
  chatBubbleAlignForRole,
  recordSectionCountLabel,
} from "./src/uiInteractionCopy";
import { privacyResourceTypeLabel } from "./src/privacyFlow";
import {
  createConversationAndSelect,
  deleteConversationAndSelect,
  normalizeDisplayName,
} from "./src/mvpUiFlows";
import {
  formatBadge,
  recordings,
  recordSections,
  summaryChapters,
  transcriptTurns,
  type TabKey,
} from "./src/mockData";
import { colors, radius, shadow } from "./src/theme";

LogBox.ignoreLogs(["SafeAreaView has been deprecated"]);

// 每次发版手动递增，用于在手机端确认实际安装的是哪一次构建。
// 出现「改了代码但手机上还是旧样子」时，先看这个标识。
const BUILD_TAG = "0831-4";

type QuickView =
  | "overview"
  | "recording"
  | "recordingRecords"
  | "recordingProcessing"
  | "archive"
  | "archiveComplete"
  | "supervision"
  | "profileUnlock"
  | "profileDetail"
  | "profileCreate"
  | "recordingDetail"
  | "chapterEditor"
  | "transcriptEditor"
  | "sessionMaterials"
  | "filePreview"
  | "recordEditor"
  | "caseReportSelect"
  | "caseReportEditor"
  | "privacyCenter"
  | "profilePrivacy"
  | "reportGeneration"
  | "articleDetail"
  | "statistics"
  | "schedule"
  | "securitySettings";
type SecuritySection = "profileAccess" | "calendar" | "account";
type Notice = { title: string; detail: string };
type PendingReportGeneration = {
  mode: "create" | "regenerate";
  sessionId: string;
  returnView: QuickView;
  reportType: string;
  reportId?: string;
  recordType: string;
  sources: ReportSource[];
  loading?: boolean;
  loadError?: string;
};
type ArchiveResult = ReturnType<typeof buildArchiveResult> & {
  profileStatus?: string;
  profileFrequency?: string;
  profileNext?: string;
  profileNextSessionAt?: string | null;
  countDetail?: string;
  sessionCount?: number;
  initialSessionCount?: number;
  latestSequence?: number;
  recordingId?: string;
  sessionId?: string;
  profileId?: string;
  profileCode?: string;
  profileNotes?: string;
};
type ProfileCreateInput = {
  kind: ArchiveKind;
  name: string;
  code: string;
  status: string;
  crisisLevel?: string;
  initialSessionCount: number;
  next: string;
  frequency: string;
  metadata: Record<string, string>;
  notes: string;
};
type EditableRecordSection = { title: string; content: string };
type EditableChapter = { time: string; title: string; current?: boolean };
type EditableTranscriptTurn = {
  id?: string;
  speakerKey?: string;
  time: string;
  speaker: string;
  text: string;
};
type RecordingItem = {
  id?: string;
  sessionId?: string;
  title: string;
  duration: string;
  status: string;
  archive: string;
  ttl: string;
  profileName: string | null;
  kindLabel: "来访者" | "督导师" | "受督者" | null;
  recordLabel: string | null;
  processingError?: string | null;
  audioFileId?: string | null;
};
type PreviewFile = {
  id: string;
  ownerKey?: string;
  title: string;
  meta: string;
  fileType: string;
  source: "material" | "legal";
  file: StoredFileReference | null;
};

function sectionsFromReport(report: Report, formal: boolean): EditableRecordSection[] {
  const content = formal && report.formalContent ? report.formalContent : report.draftContent;
  const blocks = Array.isArray(content.blocks)
    ? content.blocks as Array<{ title?: string; content?: string }>
    : [];
  return blocks.map((block, index) => ({
    title: block.title ?? `第 ${index + 1} 部分`,
    content: block.content ?? "",
  }));
}

function emptyGeneratedRecordSections(): EditableRecordSection[] {
  return [{
    title: "记录草稿",
    content: "暂无可编辑内容。请返回后确认本次资料已归档并重新生成。",
  }];
}

const apiClient = new ApiClient(configuredApiBaseUrl());
const authService = createAuthService(apiClient);
const authSessionStore = createDeviceAuthSessionStore();
const profileService = createProfileService(apiClient);
const profileAccessService = createProfileAccessService(apiClient);
const sessionService = createSessionService(apiClient);
const attachmentService = createAttachmentService(apiClient);
const fileService = createBackendFileService(apiClient);
const recordingService = createRecordingService(apiClient);
const jobService = createJobService(apiClient);
const reportService = createReportService(apiClient);
const privacyService = createPrivacyService(apiClient);
const calendarService = createCalendarService(apiClient);
const supervisionService = createSupervisionService(apiClient);

const articles = [
  {
    id: "supervision",
    title: "如何准备一次有效督导",
    tag: "督导",
    summary: "从近期记录中提炼事实、咨询师反应、风险和真正需要讨论的不确定点。",
    sections: [
      "先写清发生了什么，避免只用“卡住了”“没效果”等结论替代事实。",
      "区分来访者反应、咨询师自身反应与技术选择，标出最希望得到反馈的部分。",
      "带入必要材料即可，不要默认暴露整份档案；督导结束后记录可执行的下一步。",
    ],
  },
  {
    id: "privacy",
    title: "咨询资料保存的边界",
    tag: "隐私",
    summary: "理解 14 天临时保存、主动长期授权、撤回授权与原始录音销毁边界。",
    sections: [
      "原始录音仅临时保存 14 天，不能授权长期云端保存。",
      "转写、纪要、记录和附件需要逐项主动授权，默认不会长期保留。",
      "撤回授权后，若原临时期限已经结束，对应资料应立即销毁。",
    ],
  },
  {
    id: "risk",
    title: "危机风险记录的提醒",
    tag: "安全",
    summary: "风险记录应包含观察依据、当事人表述、已采取行动与后续复核安排。",
    sections: [
      "记录具体事实与原话，避免只写“高风险”而没有判断依据。",
      "写明已完成的评估、告知、转介或紧急联系，以及相关时间点。",
      "保留下一次复核安排，并在风险变化时更新正式记录。",
    ],
  },
];

const tabs: Array<{ key: TabKey; label: string; icon: typeof Home }> = [
  { key: "home", label: "首页", icon: Home },
  { key: "profiles", label: "档案", icon: FolderOpen },
  { key: "recordings", label: "资讯", icon: Newspaper },
  { key: "account", label: "我的", icon: UserRound },
];

function getRecordType(kindLabel: string) {
  return kindLabel === "来访者" ? "咨询记录" : kindLabel === "督导师" ? "督导反馈" : "督导记录";
}

function getReportType(kindLabel: string) {
  return kindLabel === "来访者"
    ? "counseling_note"
    : kindLabel === "督导师"
      ? "supervision_feedback"
      : "supervision_note";
}

function defaultReportSources(sources: ReportSource[], excludeReportId?: string) {
  return sources.filter((source) => (
    source.defaultSelected
    && source.analysisStatus === "available"
    && !(source.resourceType === "report" && source.resourceId === excludeReportId)
  ));
}

function reportSourceGroups(sources: ReportSource[]) {
  const labels = new Set<string>();
  sources.forEach((source) => {
    if (source.resourceType === "session") labels.add("本次摘要");
    else if (source.resourceType === "transcript" || source.resourceType === "recording_summary") labels.add("录音");
    else if (source.resourceType === "profile") labels.add("基础档案");
    else if (source.resourceType === "report") labels.add("既往记录/报告");
    else if (source.label.includes("量表") || source.label.includes("scale")) labels.add("量表");
    else if (source.label.includes("作业") || source.label.includes("homework")) labels.add("作业");
    else labels.add("其他资料");
  });
  return Array.from(labels);
}

function getRecordEditorSections(kindLabel: string): EditableRecordSection[] {
  if (kindLabel === "督导师") {
    return [
      { title: "本次督导议题", content: "聚焦案例概念化、咨询边界和当前干预选择中的犹豫。" },
      { title: "督导师反馈", content: "建议先区分风险评估、关系反应和技术选择，明确本阶段优先目标，并补充可验证的风险记录。" },
      { title: "后续行动", content: "下一次咨询前完善风险评估记录，并整理一段关键互动带入下次受督。" },
    ];
  }
  if (kindLabel === "受督者") {
    return [
      { title: "本次督导主题", content: "围绕受督者的案例理解、咨询目标和关系处理展开。" },
      { title: "督导过程摘要", content: "共同梳理了当前工作的有效部分、待澄清风险和下一阶段练习重点。" },
      { title: "后续计划", content: "受督者将在下一次督导前补充咨询记录，并准备一段需要进一步讨论的材料。" },
    ];
  }
  return recordSections.map((section) => ({ ...section }));
}

function getCaseReportSections(): EditableRecordSection[] {
  return [
    { title: "基本情况与核心议题", content: "来访者近期主要受到工作评价焦虑、睡眠下降及关系中的自我怀疑影响。" },
    { title: "咨询进展与阶段评估", content: "多次咨询中，来访者逐步能够区分事实、推测与情绪反应，并开始识别焦虑出现前的身体信号。" },
    { title: "风险与资源评估", content: "当前风险评估为轻度，已有稳定求助关系与一定自我观察能力，仍需持续记录风险变化。" },
    { title: "后续咨询建议", content: "继续围绕评价场景中的自动化想法、身体反应和可验证事实开展工作，并按阶段复核目标。" },
  ];
}

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseDuration(value: string): number {
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function recordingDurationStat(
  stats: RecordingDurationStatistics | null,
  profileType: ArchiveKind | null,
): { count: number; seconds: number } {
  const item = stats?.items.find((entry) => entry.profileType === profileType);
  return {
    count: item?.count ?? 0,
    seconds: item?.durationSeconds ?? 0,
  };
}

function recordingTtl(recording: Recording): string {
  if (recording.audioDestroyedAt) return "原始录音已销毁";
  if (!recording.audioExpiresAt) return "未上传原始录音";
  const remaining = Math.max(
    0,
    Math.ceil((new Date(recording.audioExpiresAt).getTime() - Date.now()) / 86_400_000),
  );
  return remaining > 0 ? `剩余 ${remaining} 天` : "等待销毁";
}

function mapRecordingItem(recording: Recording): RecordingItem {
  const labels: Record<ArchiveKind, RecordingItem["kindLabel"]> = {
    client: "来访者",
    supervisor: "督导师",
    supervisee: "受督者",
  };
  const recordNoun = recording.profile?.type === "client"
    ? "咨询"
    : recording.profile?.type === "supervisor"
      ? "受督"
      : "督导";
  const status = recording.aiStatus === "completed"
    ? "可查看"
    : recording.aiStatus === "failed"
      ? "处理失败"
      : recording.aiStatus === "processing"
        ? "生成中"
        : "待处理";
  return {
    id: recording.id,
    sessionId: recording.session?.id,
    title: recording.title,
    duration: recording.durationSeconds == null ? "待识别" : formatDuration(recording.durationSeconds),
    status,
    archive: recording.archiveStatus === "archived" ? "已归档" : "待归档",
    ttl: recordingTtl(recording),
    profileName: recording.profile?.name ?? null,
    kindLabel: recording.profile ? labels[recording.profile.type] : null,
    recordLabel: recording.session ? `第 ${recording.session.sequenceNo} 次${recordNoun}` : null,
    processingError: recording.processingError,
    audioFileId: recording.audioFileId,
  };
}

function archiveKindForProfile(profile: ProfileListItem): ArchiveKind {
  if (profile.type === "督导师") return "supervisor";
  if (profile.type === "受督者") return "supervisee";
  return "client";
}

function archiveKindForLabel(label: ArchiveResult["kindLabel"]): ArchiveKind {
  if (label === "督导师") return "supervisor";
  if (label === "受督者") return "supervisee";
  return "client";
}

function nextSessionLabel(next: string): string {
  if (next === "未设置") return "未设置下次安排";
  if (next.startsWith("已过期")) return next;
  return `下次 ${next}`;
}

function normalizeAccessPinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function isCompleteAccessPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function optimisticUser(email: string, displayName = "咨询师"): CurrentUser {
  const now = new Date().toISOString();
  return {
    id: "pending",
    email,
    display_name: displayName,
    created_at: now,
    updated_at: now,
  };
}

/**
 * 全局错误边界：捕获渲染期未处理异常，避免生产包直接闪退（强制关闭）。
 * 同时把错误文本暴露出来，便于精准定位根因。
 */
class AppErrorBoundary extends Component<{ onReset: () => void; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      const stack = String(this.state.error.stack ?? "").split("\n").slice(0, 12).join("\n");
      return (
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
            <View style={styles.errorCard}>
              <CircleAlert size={28} color={colors.danger} />
              <Text style={styles.errorTitle}>页面出现错误</Text>
              <Text style={styles.errorCopy}>{this.state.error.message}</Text>
              <Text style={styles.errorStack}>{stack}</Text>
              <PrimaryButton
                icon={Home}
                label="返回首页"
                onPress={() => {
                  this.setState({ error: null });
                  this.props.onReset();
                }}
                wide
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<"loading" | "guest" | "authenticated">("loading");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("home");
  const [quickView, setQuickView] = useState<QuickView>("overview");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [archiveResult, setArchiveResult] = useState<ArchiveResult | null>(null);
  const [archiveRecording, setArchiveRecording] = useState<ArchiveRecording>({
    title: "新录音 06-07",
    duration: "42:18",
  });
  const [archiveRecordingId, setArchiveRecordingId] = useState<string | null>(null);
  const [archiveAudioFileId, setArchiveAudioFileId] = useState<string | null>(null);
  const [archiveReturn, setArchiveReturn] = useState<QuickView>("recording");
  const [activeRecording, setActiveRecording] = useState<RecordingItem>(recordings[0]);
  const [recordingItems, setRecordingItems] = useState<RecordingItem[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [activeRecordingJob, setActiveRecordingJob] = useState<AIJob | null>(null);
  const [recordingProcessingBusy, setRecordingProcessingBusy] = useState(false);
  const [profileItems, setProfileItems] = useState<ProfileListItem[]>([]);
  const [dashboardEvents, setDashboardEvents] = useState<CalendarEvent[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [recordEditorReturn, setRecordEditorReturn] = useState<QuickView>("profileDetail");
  const [pendingReportGeneration, setPendingReportGeneration] = useState<PendingReportGeneration | null>(null);
  const [reportGenerationBusy, setReportGenerationBusy] = useState(false);
  const [recordingDetailReturn, setRecordingDetailReturn] = useState<QuickView>("recordingRecords");
  const [privacyReturn, setPrivacyReturn] = useState<{ quickView: QuickView; tab: TabKey }>({
    quickView: "overview",
    tab: "account",
  });
  const [activeProfile, setActiveProfile] = useState<ArchiveResult>({
    profileName: "陈雨",
    kindLabel: "来访者",
    recordLabel: "第 6 次咨询",
  });
  const [activeProfileId, setActiveProfileId] = useState("profile-chen-yu");
  // 防止快速切换/连续刷新时，旧异步请求返回后覆盖新数据（竞态 → 显示错档案/录音记录）。
  // 每次发起请求自增计数并捕获本次 id，返回后若不是最新则丢弃结果。
  const profileDataRequestId = useRef(0);
  const recordingDetailRequestId = useRef(0);
  const [pendingProfile, setPendingProfile] = useState<ProfileListItem | null>(null);
  const [pendingProfileDestination, setPendingProfileDestination] = useState<QuickView>("profileDetail");
  const [pendingRecordingAfterUnlock, setPendingRecordingAfterUnlock] = useState<RecordingItem | null>(null);
  const [pendingRecordingReturn, setPendingRecordingReturn] = useState<QuickView>("recordingRecords");
  const [profilePasswordSet, setProfilePasswordSet] = useState(false);
  const [profileAccessGrantMinutes, setProfileAccessGrantMinutes] = useState(60);
  const [unlockedProfileId, setUnlockedProfileId] = useState<string | null>(null);
  const [recordEditorSections, setRecordEditorSections] = useState<EditableRecordSection[]>(getRecordEditorSections("来访者"));
  const [recordFormal, setRecordFormal] = useState(false);
  const [activeRecordReport, setActiveRecordReport] = useState<Report | null>(null);
  const [recordDirty, setRecordDirty] = useState(true);
  const [activeRecordReportId, setActiveRecordReportId] = useState<string | null>(null);
  const [activeRecordLabel, setActiveRecordLabel] = useState("第 6 次咨询");
  const [caseReportSections, setCaseReportSections] = useState<EditableRecordSection[]>(getCaseReportSections());
  const [caseReportFormal, setCaseReportFormal] = useState(false);
  const [caseReportSources, setCaseReportSources] = useState<ReportSource[]>([]);
  const [activeCaseReportId, setActiveCaseReportId] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [sessionMaterials, setSessionMaterials] = useState<SessionMaterial[]>([]);
  const [activeMaterialCategory, setActiveMaterialCategory] = useState<MaterialCategory>("recording");
  const [activeSessionId, setActiveSessionId] = useState("session-6");
  const [materialReturn, setMaterialReturn] = useState<QuickView>("profileDetail");
  const [filePreviewReturn, setFilePreviewReturn] = useState<QuickView>("sessionMaterials");
  const [systemCalendarEnabled, setSystemCalendarEnabled] = useState(false);
  const [privacyTitleMode, setPrivacyTitleMode] = useState(false);
  const [activeFile, setActiveFile] = useState<PreviewFile | null>(null);
  const [securityInitialSection, setSecurityInitialSection] = useState<SecuritySection>("profileAccess");
  const [legalAttachments, setLegalAttachments] = useState<ProfileAttachment[]>([]);
  const [recordingSummary, setRecordingSummary] = useState(describeRecordingContext(recordings[0].title).summary);
  const [recordingChapters, setRecordingChapters] = useState<EditableChapter[]>(summaryChapters);
  const [recordingTurns, setRecordingTurns] = useState<EditableTranscriptTurn[]>(transcriptTurns);
  const [recordingHasEdits, setRecordingHasEdits] = useState(false);
  const [recordingDurationStats, setRecordingDurationStats] = useState<RecordingDurationStatistics | null>(null);
  const [activeArticle, setActiveArticle] = useState(articles[0]);
  const { width } = useWindowDimensions();
  const isCompact = width < 430;
  const showNotice = (title: string, detail: string) => setNotice({ title, detail });
  const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : "无法连接后端服务，请稍后重试。";
  const loadProfiles = async () => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      setProfileItems(await profileService.list());
    } catch (error) {
      setProfilesError(errorMessage(error));
    } finally {
      setProfilesLoading(false);
    }
  };
  const loadRecordings = async () => {
    setRecordingsLoading(true);
    try {
      const [response, stats] = await Promise.all([
        recordingService.list({ pageSize: 100 }),
        recordingService.durationStatistics(),
      ]);
      setRecordingItems(response.items.map(mapRecordingItem));
      setRecordingDurationStats(stats);
    } catch (error) {
      showNotice("录音列表加载失败", errorMessage(error));
    } finally {
      setRecordingsLoading(false);
    }
  };
  const refreshRecording = async (recordingId: string): Promise<RecordingItem | null> => {
    const [response, stats] = await Promise.all([
      recordingService.list({ pageSize: 100 }),
      recordingService.durationStatistics(),
    ]);
    const items = response.items.map(mapRecordingItem);
    setRecordingItems(items);
    setRecordingDurationStats(stats);
    const refreshed = items.find((item) => item.id === recordingId) ?? null;
    if (refreshed) setActiveRecording(refreshed);
    return refreshed;
  };
  const runRecordingProcessing = async (
    recordingId: string,
    retry: boolean,
  ): Promise<RecordingItem | null> => {
    setRecordingProcessingBusy(true);
    setActiveRecordingJob(null);
    setActiveRecording((current) => current.id === recordingId
      ? { ...current, status: "生成中", processingError: null }
      : current);
    try {
      const command = retry
        ? await recordingService.retry(recordingId)
        : await recordingService.process(recordingId, "archived_context");
      const job = await waitForRecordingJob(jobService.get, command.job_id);
      setActiveRecordingJob(job);
      const refreshed = await refreshRecording(recordingId);
      if (job.status === "failed") {
        showNotice("录音处理失败", job.error?.message ?? "模型服务暂时不可用，可以稍后重试。");
      }
      return refreshed;
    } catch (error) {
      const refreshed = await refreshRecording(recordingId).catch(() => null);
      showNotice("录音处理失败", errorMessage(error));
      return refreshed;
    } finally {
      setRecordingProcessingBusy(false);
    }
  };
  const loadRecordingDetail = async (recording: RecordingItem) => {
    if (!recording.id) return;
    const requestId = ++recordingDetailRequestId.current;
    const [summary, transcript] = await Promise.all([
      recordingService.summary(recording.id),
      recordingService.transcript(recording.id),
    ]);
    if (recordingDetailRequestId.current !== requestId) return;
    setRecordingSummary(summary.mainSummary);
    setRecordingChapters(summary.chapterOverview.map((chapter, index) => {
      const startMs = Number(chapter.start_ms ?? 0);
      return {
        time: typeof chapter.time === "string"
          ? chapter.time
          : formatDuration(Math.max(0, Math.floor(startMs / 1000))),
        title: String(chapter.title ?? chapter.label ?? `章节 ${index + 1}`),
        current: index === 0,
      };
    }));
    setRecordingTurns(transcript.segments.map((segment) => ({
      id: segment.id,
      speakerKey: segment.speaker_key,
      time: formatDuration(Math.floor(segment.start_ms / 1000)),
      speaker: segment.speaker_label,
      text: segment.text,
    })));
    setRecordingHasEdits(summary.manualEdited || transcript.manualEdited);
  };
  const loadProfileData = async (profileId: string, recordingsForStatus = recordingItems) => {
    const requestId = ++profileDataRequestId.current;
    try {
      const [sessions, profileAttachments, profileReports] = await Promise.all([
        sessionService.list(profileId),
        attachmentService.listProfile(profileId),
        reportService.list({ profileId }),
      ]);
      if (profileDataRequestId.current !== requestId) return;
      setLegalAttachments(profileAttachments);
      const materials = (await Promise.all(
        sessions.map((session) => attachmentService.listSession(session.id)),
      )).flat();
      const sessionsWithReports = applySessionReportStatuses(sessions, profileReports);
      setSessionHistory(applySessionResourceStatuses(sessionsWithReports, materials, recordingsForStatus));
      setSessionMaterials(materials);
      setProfileItems((current) => current.map((item) => {
        if (item.id !== profileId) return item;
        const latestSequence = Math.max(item.initialSessionCount ?? 0, ...sessions.map((session) => session.sequence));
        const sessionCount = sessions.length;
        return {
          ...item,
          count: latestSequence > 0 ? `第${latestSequence}次` : "尚无记录",
          countDetail: item.initialSessionCount && item.initialSessionCount > 0
            ? `系统内 ${sessionCount} 条 · 既往 ${item.initialSessionCount} 次`
            : sessionCount > 0 ? `系统内 ${sessionCount} 条` : undefined,
          sessionCount,
          latestSequence,
        };
      }));
      setActiveProfile((current) => {
        if (!current) return current;
        const latestSequence = Math.max(current.initialSessionCount ?? 0, ...sessions.map((session) => session.sequence));
        const sessionCount = sessions.length;
        const recordNoun = current.kindLabel === "来访者" ? "咨询" : current.kindLabel === "督导师" ? "受督" : "督导";
        return {
          ...current,
          recordLabel: latestSequence > 0 ? `第 ${latestSequence} 次${recordNoun}` : "尚无记录",
          countDetail: current.initialSessionCount && current.initialSessionCount > 0
            ? `系统内 ${sessionCount} 条 · 既往 ${current.initialSessionCount} 次`
            : sessionCount > 0 ? `系统内 ${sessionCount} 条` : undefined,
          sessionCount,
          latestSequence,
        };
      });
    } catch (error) {
      if (profileDataRequestId.current !== requestId) return;
      setSessionHistory([]);
      setSessionMaterials([]);
      setLegalAttachments([]);
      void handleProfileAccessError(error).then((handled) => {
        if (!handled) showNotice("档案数据加载失败", errorMessage(error));
      });
    }
  };
  const selectProfile = (profile: ProfileListItem) => {
    const recordNoun = profile.type === "来访者" ? "咨询" : profile.type === "督导师" ? "受督" : "督导";
    setActiveProfileId(profile.id);
    setActiveProfile({
      profileName: profile.name,
      kindLabel: profile.type,
      recordLabel: profile.count === "尚无记录" ? profile.count : `${profile.count}${recordNoun}`,
      profileStatus: profile.status,
      profileFrequency: profile.frequency ?? "未设置",
      profileNext: profile.next,
      profileNextSessionAt: profile.nextSessionAt,
      countDetail: profile.countDetail,
      sessionCount: profile.sessionCount,
      initialSessionCount: profile.initialSessionCount,
      latestSequence: profile.latestSequence,
      profileCode: profile.displayCode,
      profileNotes: profile.notes,
    });
    void loadProfileData(profile.id);
  };
  const openRecording = async (recording: RecordingItem, returnView: QuickView = "recordingRecords") => {
    const destination = getRecordingDestination(recording);
    setRecordingDetailReturn(returnView);
    setActiveRecording(recording);
    setArchiveRecordingId(recording.id ?? null);
    setArchiveAudioFileId(recording.audioFileId ?? null);
    const storedProfile = recording.profileName
      ? profileItems.find((profile) => profile.name === recording.profileName)
      : undefined;
    if (recording.profileName && recording.kindLabel && recording.recordLabel) {
      setActiveProfile({
        profileName: recording.profileName,
        kindLabel: recording.kindLabel,
        recordLabel: recording.recordLabel,
        profileStatus: storedProfile?.status,
        profileFrequency: storedProfile?.frequency ?? "未设置",
        profileNext: storedProfile?.next,
        profileNextSessionAt: storedProfile?.nextSessionAt,
      });
    }
    if (destination === "archive") {
      setArchiveRecording(toArchiveRecording(recording));
      setArchiveReturn("recordingRecords");
      setQuickView("archive");
      return;
    }
    if (destination === "processing") {
      setActiveRecordingJob(null);
      setQuickView("recordingProcessing");
      return;
    }
    const currentProfileAlreadyUnlocked = Boolean(
      storedProfile
      && storedProfile.id === activeProfileId
      && storedProfile.id === unlockedProfileId,
    );
    if (!currentProfileAlreadyUnlocked && recordingDetailRequiresProfileUnlock({
      destination,
      profileName: recording.profileName,
      kindLabel: recording.kindLabel,
    }) && storedProfile) {
      try {
        const kind = archiveKindForProfile(storedProfile);
        const statuses = await profileAccessService.statuses();
        setPendingProfile(storedProfile);
        setPendingRecordingAfterUnlock(recording);
        setPendingRecordingReturn(returnView);
        setProfilePasswordSet(statuses.items.find((item) => item.profile_type === kind)?.is_set ?? false);
        setProfileAccessGrantMinutes(statuses.grantMinutes);
        setQuickView("profileUnlock");
      } catch (error) {
        showNotice("无法打开录音内容", errorMessage(error));
      }
      return;
    }
    try {
      await loadRecordingDetail(recording);
      setQuickView("recordingDetail");
    } catch (error) {
      showNotice("录音内容加载失败", errorMessage(error));
    }
  };
  const openProfile = async (profile: ProfileListItem, destination: QuickView = "profileDetail") => {
    try {
      const kind = archiveKindForProfile(profile);
      if (profileAccessService.hasActiveGrant(kind)) {
        setUnlockedProfileId(profile.id);
        selectProfile(profile);
        setQuickView(destination);
        return;
      }
      const statuses = await profileAccessService.statuses();
      setPendingProfile(profile);
      setPendingProfileDestination(destination);
      setPendingRecordingAfterUnlock(null);
      setProfilePasswordSet(statuses.items.find((item) => item.profile_type === kind)?.is_set ?? false);
      setProfileAccessGrantMinutes(statuses.grantMinutes);
      setQuickView("profileUnlock");
    } catch (error) {
      showNotice("无法进入档案", errorMessage(error));
    }
  };
  const handleProfileAccessError = async (error: unknown): Promise<boolean> => {
    if (!(error instanceof ApiError) || ![
      "profile_access_grant_required",
      "profile_access_grant_invalid",
    ].includes(error.code)) {
      return false;
    }
    const profile = profileItems.find((item) => item.id === activeProfileId);
    if (!profile) return false;
    const kind = archiveKindForProfile(profile);
    const statuses = await profileAccessService.statuses().catch(() => ({
      items: [],
      grantMinutes: profileAccessGrantMinutes,
      grantOptions: [30, 60, 120],
    }));
    profileAccessService.clearGrants();
    setUnlockedProfileId(null);
    setPendingProfile(profile);
    setPendingRecordingAfterUnlock(null);
    setProfilePasswordSet(statuses.items.find((item) => item.profile_type === kind)?.is_set ?? false);
    setProfileAccessGrantMinutes(statuses.grantMinutes);
    setQuickView("profileUnlock");
    showNotice("需要重新验证", "档案访问授权已失效，请重新输入访问密码后继续。");
    return true;
  };
  const openReportEditor = (report: Report, sessionId: string, returnView: QuickView, forceDraft = false) => {
    const showFormal = Boolean(
      !forceDraft
      && report.formalContent
      && sessionHistory.find((session) => session.id === sessionId)?.record === "正式版",
    );
    const sections = sectionsFromReport(report, showFormal);
    setActiveRecordReportId(report.id);
    setActiveRecordReport(report);
    setRecordEditorReturn(returnView);
    setRecordEditorSections(sections.length ? sections : emptyGeneratedRecordSections());
    setRecordFormal(showFormal);
    setRecordDirty(false);
    setQuickView("recordEditor");
  };
  const openSessionRecord = async (sessionId: string, returnView: QuickView) => {
    try {
      const reportType = getReportType(activeProfile.kindLabel);
      const session = sessionHistory.find((item) => item.id === sessionId);
      const recordType = getRecordType(activeProfile.kindLabel);
      setActiveSessionId(sessionId);
      setActiveRecordLabel(session ? `第 ${session.sequence} 次${recordType}` : activeProfile.recordLabel);
      setRecordEditorReturn(returnView);
      // 立即进入生成页，请求在页面内完成（页面显示「正在读取可用资料」）。
      // 过去要先 await 两个请求才决定是否弹层，网络慢时表现为「点了没反应」。
      setPendingReportGeneration({
        mode: "create",
        sessionId,
        returnView,
        reportType,
        recordType,
        sources: [],
        loading: true,
        loadError: undefined,
      });
      setQuickView("reportGeneration");
    } catch (error) {
      showNotice("打开生成页失败", errorMessage(error));
    }
  };
  const confirmReportGeneration = async () => {
    if (!pendingReportGeneration || reportGenerationBusy) return;
    setReportGenerationBusy(true);
    try {
      const selectedSources = pendingReportGeneration.sources.map((source) => ({
        resourceType: source.resourceType,
        resourceId: source.resourceId,
      }));
      const reportId = pendingReportGeneration.mode === "create"
        ? (await reportService.generate({
          reportType: pendingReportGeneration.reportType,
          profileId: activeProfileId,
          sessionId: pendingReportGeneration.sessionId,
          selectedSources,
        })).reportId
        : (await reportService.regenerate(pendingReportGeneration.reportId!, {
          selectedSources,
          confirmOverwriteDraft: true,
        })).draft_report_id;
      const report = await reportService.get(reportId);
      openReportEditor(
        report,
        pendingReportGeneration.sessionId,
        pendingReportGeneration.returnView,
        pendingReportGeneration.mode === "regenerate",
      );
      setSessionHistory((current) => current.map((session) => (
        session.id === pendingReportGeneration.sessionId ? { ...session, record: "草稿" } : session
      )));
      setPendingReportGeneration(null);
      showNotice(
        pendingReportGeneration.mode === "create" ? "草稿已生成" : "草稿已重新生成",
        `已基于所列资料生成${pendingReportGeneration.recordType}草稿。`,
      );
    } catch (error) {
      showNotice("生成失败", errorMessage(error));
    } finally {
      setReportGenerationBusy(false);
    }
  };
  // 生成页的资料在页面内加载：点击「生成咨询记录」后立刻跳转，
  // 由页面展示「正在读取可用资料」，避免等待请求时看起来没反应。
  useEffect(() => {
    if (quickView !== "reportGeneration" || !pendingReportGeneration?.loading) return;
    let active = true;
    const pending = pendingReportGeneration;
    void (async () => {
      try {
        if (pending.mode === "create") {
          const report = (await reportService.list({
            sessionId: pending.sessionId,
            reportType: pending.reportType,
          }))[0];
          if (!active) return;
          if (report) {
            setPendingReportGeneration(null);
            openReportEditor(report, pending.sessionId, pending.returnView);
            setSessionHistory((current) => current.map((session) => (
              session.id === pending.sessionId
                ? { ...session, record: report.formalSavedAt ? "正式版" : "草稿" }
                : session
            )));
            // 明确告知为什么直接进了编辑器：该次咨询已存在草稿/正式版记录。
            // 过去静默重定向，用户以为「点了生成却进了编辑页」是 bug。
            showNotice(
              report.formalSavedAt ? `已打开该次${pending.recordType}正式版` : `已找到该次${pending.recordType}草稿`,
              report.formalSavedAt
                ? "该次咨询已生成过正式版记录，已直接打开查看（编辑页可切换草稿/正式版）。"
                : "该次咨询已生成过草稿，已直接打开继续编辑；如需重写可在编辑页重新生成草稿。",
            );
            return;
          }
        }
        const sources = await reportService.generationSources({
          reportType: pending.reportType,
          profileId: activeProfileId,
          sessionId: pending.sessionId,
        });
        if (!active) return;
        const selected = defaultReportSources(sources, pending.reportId);
        setPendingReportGeneration((current) => (
          current && current.sessionId === pending.sessionId && current.mode === pending.mode
            ? { ...current, sources: selected, loading: false, loadError: undefined }
            : current
        ));
      } catch (error) {
        if (!active) return;
        const loadError = errorMessage(error);
        setPendingReportGeneration((current) => keepReportGenerationLoadError(current, pending, loadError));
      }
    })();
    return () => {
      active = false;
    };
  }, [activeProfileId, pendingReportGeneration, quickView]);

  // 轻量刷新「每次咨询的记录状态」（未生成/草稿/正式版），不带附件 N+1 请求。
  // 用于从编辑器/生成页返回档案详情时校正按钮文案：
  // 过去 sessionHistory 是进入档案时的快照，若记录在其他端（web）生成过，
  // 按钮仍显示「生成咨询记录」，点击后被服务端实时状态重定向到编辑页，用户感知为 bug。
  const sessionStatusRequestId = useRef(0);
  const refreshSessionStatuses = async () => {
    if (!activeProfileId) return;
    const requestId = ++sessionStatusRequestId.current;
    try {
      const [sessions, profileReports] = await Promise.all([
        sessionService.list(activeProfileId),
        reportService.list({ profileId: activeProfileId }),
      ]);
      if (sessionStatusRequestId.current !== requestId) return;
      const nextById = new Map(applySessionReportStatuses(sessions, profileReports)
        .map((session) => [session.id, session]));
      setSessionHistory((current) => current.map((session) => {
        const next = nextById.get(session.id);
        return next ? { ...next, recording: session.recording, scale: session.scale, homework: session.homework, other: session.other } : session;
      }));
    } catch {
      // 静默失败：保留现有展示，不打断用户。
    }
  };
  const prevQuickViewRef = useRef<QuickView | null>(null);
  useEffect(() => {
    const from = prevQuickViewRef.current;
    if (from === quickView) return;
    prevQuickViewRef.current = quickView;
    // 返回档案详情页时刷新记录状态（首次挂载 from=null 不刷，初始加载已覆盖）。
    if (quickView === "profileDetail" && from && from !== "profileDetail") {
      void refreshSessionStatuses();
    }
  }, [quickView, activeProfileId]);

  const openPrivacy = (returnView: QuickView) => {
    setPrivacyReturn({ quickView: returnView, tab });
    setQuickView("privacyCenter");
  };
  const resetRecordingEditor = (recording: RecordingItem) => {
    const context = describeRecordingContext(recording.title);
    const isSupervision = context.actionLabel === "生成督导反馈";
    setRecordingSummary(context.summary);
    setRecordingChapters(isSupervision
      ? [
          { time: "00:06", title: "案例概念化与当前困惑", current: true },
          { time: "11:18", title: "风险、关系与技术选择的区分" },
          { time: "25:42", title: "后续行动与下次受督准备" },
        ]
      : summaryChapters);
    setRecordingTurns(isSupervision
      ? [
          { time: "06:18", speaker: "咨询师", text: "我想讨论来访者在评价场景中的焦虑，以及我在推进干预时的犹豫。" },
          { time: "08:42", speaker: "督导师", text: "可以先区分风险评估、关系反应和技术选择，再决定本阶段最优先的目标。" },
          { time: "12:09", speaker: "咨询师", text: "我会补充风险记录，并把下一次咨询聚焦到可验证的触发事件。" },
        ]
      : transcriptTurns);
    setRecordingHasEdits(false);
  };
  const openMaterials = async (category: MaterialCategory, sessionId: string, returnView: QuickView = "profileDetail") => {
    if (category === "recording") {
      const sessionRecording = findRecordingForSession(recordingItems, sessionId);
      if (sessionRecording) {
        await openRecording(sessionRecording, returnView);
        return;
      }
    }
    setActiveMaterialCategory(category);
    setActiveSessionId(sessionId);
    setMaterialReturn(returnView);
    setQuickView("sessionMaterials");
    void attachmentService.listSession(sessionId, category)
      .then((items) => setSessionMaterials((current) => [
        ...current.filter((item) => item.sessionId !== sessionId || item.category !== category),
        ...items,
      ]))
      .catch((error) => {
        void handleProfileAccessError(error).then((handled) => {
          if (!handled) showNotice("附件加载失败", errorMessage(error));
        });
      });
  };
  const openFilePreview = (file: PreviewFile, returnView: QuickView) => {
    setActiveFile(file);
    setFilePreviewReturn(returnView);
    setQuickView("filePreview");
  };
  const pickAndUploadFile = async (
    fileType: string,
    purpose: "attachment" | "recording" = "attachment",
  ) => {
    const mimeTypes = fileType === "PDF"
      ? "application/pdf"
      : fileType === "图片"
        ? ["image/jpeg", "image/png", "image/webp", "image/heic"]
        : ["audio/mp4", "audio/mpeg", "audio/x-m4a", "audio/wav", "audio/webm"];
    const picked = await pickLocalFile(mimeTypes);
    if (!picked) return null;
    if (picked.sizeBytes <= 0) {
      throw new Error("无法读取文件大小，请重新选择本地文件。");
    }
    const upload = await fileService.createUpload({
      filename: picked.name,
      mimeType: picked.mimeType,
      sizeBytes: picked.sizeBytes,
      purpose,
    });
    await uploadLocalFile(picked, upload.upload_url, upload.upload_headers);
    const completed = await fileService.completeUpload(upload.file_id);
    return { picked, stored: completed };
  };
  const handleBack = () => {
    if (quickView === "reportGeneration") {
      if (reportGenerationBusy) return;
      const returnView = pendingReportGeneration?.returnView ?? "profileDetail";
      setPendingReportGeneration(null);
      setQuickView(returnView);
      return;
    }
    if (quickView === "recordEditor") {
      setQuickView(recordEditorReturn);
      return;
    }
    if (quickView === "sessionMaterials") {
      setQuickView(materialReturn);
      return;
    }
    if (quickView === "filePreview") {
      setQuickView(filePreviewReturn);
      return;
    }
    if (quickView === "chapterEditor" || quickView === "transcriptEditor") {
      setQuickView("recordingDetail");
      return;
    }
    if (quickView === "caseReportEditor") {
      setQuickView("caseReportSelect");
      return;
    }
    if (quickView === "caseReportSelect") {
      setQuickView("profileDetail");
      return;
    }
    if (quickView === "archive") {
      setQuickView(archiveReturn);
      return;
    }
    if (quickView === "archiveComplete" || quickView === "recordingDetail" || quickView === "recordingProcessing") {
      if (quickView === "recordingDetail") {
        if (recordingDetailReturn !== "profileDetail" && recordingDetailReturn !== "sessionMaterials") {
          profileAccessService.leaveProfile();
        }
        setQuickView(recordingDetailReturn);
        return;
      }
      setQuickView("recordingRecords");
      return;
    }
    if (quickView === "profileDetail" || quickView === "profileCreate") {
      profileAccessService.leaveProfile();
      setUnlockedProfileId(null);
      setTab("profiles");
      setQuickView("overview");
      return;
    }
    if (quickView === "profileUnlock") {
      const returnToRecordings = pendingRecordingAfterUnlock !== null;
      profileAccessService.leaveProfile();
      setUnlockedProfileId(null);
      setPendingProfile(null);
      setPendingRecordingAfterUnlock(null);
      if (returnToRecordings) {
        setQuickView(pendingRecordingReturn);
      } else {
        setTab("profiles");
        setQuickView("overview");
      }
      return;
    }
    if (quickView === "privacyCenter") {
      setTab(privacyReturn.tab);
      setQuickView(privacyReturn.quickView);
      return;
    }
    if (quickView === "articleDetail") {
      setTab("recordings");
      setQuickView("overview");
      return;
    }
    if (quickView === "statistics" || quickView === "schedule") {
      setTab("home");
      setQuickView("overview");
      return;
    }
    if (quickView === "securitySettings") {
      setTab("account");
      setQuickView("overview");
      return;
    }
    setQuickView("overview");
  };

  useEffect(() => {
    setNotice(null);
  }, [quickView, tab]);

  useEffect(() => {
    apiClient.setTokenChangeHandler((accessToken, nextRefreshToken) => {
      setRefreshToken(nextRefreshToken);
      if (nextRefreshToken) {
        void authSessionStore.save({
          accessToken,
          refreshToken: nextRefreshToken,
        });
      } else {
        void authSessionStore.clear();
      }
    });
    void (async () => {
      // Web 端：微信登录回调会把 token 放在 URL fragment（避免进入服务器日志）
      if (Platform.OS === "web") {
        const fragment = window.location.hash.replace(/^#/, "");
        const params = new URLSearchParams(fragment);
        const wechatAccess = params.get("access_token");
        const wechatRefresh = params.get("refresh_token");
        if (wechatAccess && wechatRefresh) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          apiClient.setTokens(wechatAccess, wechatRefresh);
          setRefreshToken(wechatRefresh);
          try {
            const user = await withTimeout(authService.me(), 8000, null);
            if (!user) throw new Error("WeChat session restore timed out");
            await authSessionStore.save({ accessToken: wechatAccess, refreshToken: wechatRefresh });
            setCurrentUser(user);
            setAuthStatus("authenticated");
            return;
          } catch {
            apiClient.setTokens("demo-token", null);
            setAuthStatus("guest");
            return;
          }
        }
      }
      const session = await withTimeout(authSessionStore.load(), 5000, null);
      if (!session) {
        setAuthStatus("guest");
        return;
      }
      apiClient.setTokens(session.accessToken, session.refreshToken);
      try {
        const user = await withTimeout(authService.me(), 8000, null);
        if (!user) throw new Error("Session restore timed out");
        setCurrentUser(user);
        setAuthStatus("authenticated");
      } catch {
        apiClient.setTokens("demo-token", null);
        await authSessionStore.clear();
        setAuthStatus("guest");
      }
    })();
    return () => apiClient.setTokenChangeHandler(null);
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") {
      void loadProfiles();
      void loadRecordings();
      void calendarService.listEvents()
        .then((response) => setDashboardEvents(response.items))
        .catch((error) => showNotice("日程加载失败", errorMessage(error)));
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === "authenticated" && quickView === "recordingRecords") {
      void loadRecordings();
    }
  }, [authStatus, quickView]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(timeout);
  }, [notice]);

  // 安卓系统返回键/侧滑返回：在应用内导航，而非直接退出 App（Q2）
  const handleBackRef = useRef(handleBack);
  handleBackRef.current = handleBack;
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBackPress = () => {
      if (quickView === "overview") return false;
      handleBackRef.current();
      return true;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [quickView]);

  // 加载日历同步开关（供新建记录时自动同步到系统日历，Q13）
  useEffect(() => {
    void calendarService.settings()
      .then((settings) => {
        setSystemCalendarEnabled(settings.systemCalendarEnabled);
        setPrivacyTitleMode(settings.privacyTitleModeEnabled);
      })
      .catch(() => {});
  }, []);

  // 将后端“待同步”的日程事件写入系统日历（开启同步时调用，Q13）
  const syncPendingCalendarEvents = useCallback(async () => {
    if (!systemCalendarEnabled) return;
    const driver = createExpoCalendarDriver();
    await driver.ensureWritableCalendar();
    const page = await calendarService.listEvents();
    for (const event of page.items.filter((item) => item.status === "pending" || !item.systemCalendarEventId)) {
      const systemEventId = await syncCalendarEvent(driver, {
        title: event.title,
        privacyTitle: event.privacyTitle,
        startAt: event.startAt,
        endAt: event.endAt,
      }, {
        privacyTitleMode,
        existingSystemEventId: event.systemCalendarEventId,
      });
      await calendarService.updateEvent(event.id, {
        syncToSystemCalendar: true,
        systemCalendarEventId: systemEventId,
      });
    }
  }, [systemCalendarEnabled, privacyTitleMode]);

  const title = useMemo(() => {
    if (quickView === "recording") return "录音";
    if (quickView === "recordingRecords") return "录音记录";
    if (quickView === "recordingProcessing") return "录音处理中";
    if (quickView === "archive") return "归档确认";
    if (quickView === "archiveComplete") return "归档完成";
    if (quickView === "supervision") return "智能督导";
    if (quickView === "profileUnlock") return "档案访问验证";
    if (quickView === "profileDetail") return "档案详情";
    if (quickView === "profileCreate") return "新增档案";
    if (quickView === "recordingDetail") return "录音纪要";
    if (quickView === "chapterEditor") return "编辑章节";
    if (quickView === "transcriptEditor") return "校对完整转写";
    if (quickView === "sessionMaterials") return materialCategoryCopy[activeMaterialCategory].title;
    if (quickView === "filePreview") return "文件预览";
    if (quickView === "recordEditor") return activeProfile.kindLabel === "来访者" ? "咨询记录编辑" : activeProfile.kindLabel === "督导师" ? "督导反馈编辑" : "督导记录编辑";
    if (quickView === "caseReportSelect") return "生成个案报告";
    if (quickView === "caseReportEditor") return "个案报告编辑";
    if (quickView === "privacyCenter") return "数据与隐私";
    if (quickView === "profilePrivacy") return "档案隐私";
    if (quickView === "reportGeneration") {
      return pendingReportGeneration?.mode === "regenerate" ? "重新生成草稿" : "生成记录草稿";
    }
    if (quickView === "articleDetail") return "资讯详情";
    if (quickView === "statistics") return "累计统计";
    if (quickView === "schedule") return "日程";
    if (quickView === "securitySettings") return "安全设置";
    if (tab === "profiles") return "档案库";
    if (tab === "recordings") return "资讯";
    if (tab === "account") return "我的";
    return "今天要做什么";
  }, [activeMaterialCategory, activeProfile.kindLabel, pendingReportGeneration?.mode, quickView, tab]);
  const hideBottomTabs = [
    "recording",
    "archive",
    "archiveComplete",
    "profileCreate",
    "profileUnlock",
    "profileDetail",
    "recordEditor",
    "chapterEditor",
    "transcriptEditor",
    "sessionMaterials",
    "filePreview",
    "caseReportSelect",
    "caseReportEditor",
    "privacyCenter",
    "profilePrivacy",
    "reportGeneration",
    "articleDetail",
    "statistics",
    "schedule",
    "securitySettings",
  ].includes(quickView);

  if (authStatus === "loading") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.authLoading}>
          <ActivityIndicator size="large" color={colors.clayDark} />
          <Text style={styles.authLoadingText}>正在恢复安全会话...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (authStatus === "guest") {
    return (
      <AuthScreen
        onLogin={async (email, password) => {
          await authService.login(email, password);
          setCurrentUser(optimisticUser(email));
          setAuthStatus("authenticated");
          void authService.me().then(setCurrentUser).catch(() => undefined);
        }}
        onRegister={async (email, password, displayName) => {
          await authService.register({ email, password, displayName });
          setCurrentUser(optimisticUser(email, displayName));
          setAuthStatus("authenticated");
          void authService.me().then(setCurrentUser).catch(() => undefined);
        }}
      />
    );
  }

  return (
    <AppErrorBoundary onReset={() => { setQuickView("overview"); setTab("home"); }}>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
      <View style={[styles.phoneShell, isCompact && styles.phoneShellCompact]}>
        <Header title={title} quickView={quickView} onBack={handleBack} onOpenSchedule={() => setQuickView("schedule")} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {tab === "home" && quickView === "overview" ? (
            <HomeScreen
              profiles={profileItems}
              recordings={recordingItems}
              durationStats={recordingDurationStats}
              events={dashboardEvents}
              onOpen={setQuickView}
              onOpenProfiles={() => setTab("profiles")}
              onOpenSchedule={() => setQuickView("schedule")}
              onOpenStatistics={() => setQuickView("statistics")}
            />
          ) : null}
          {quickView === "recording" ? <RecordingScreen
            onCancel={() => setQuickView("overview")}
            onSave={async (audio) => {
              try {
                const localFile = await toRecordedLocalFile(audio, Platform.OS);
                const title = `新录音 ${new Date().toLocaleDateString("zh-CN")}`;
                const upload = await fileService.createUpload({
                  filename: localFile.name,
                  mimeType: audio.mimeType,
                  sizeBytes: localFile.sizeBytes,
                  purpose: "recording",
                });
                await uploadLocalFile(localFile, upload.upload_url, upload.upload_headers);
                const stored = await fileService.completeUpload(upload.file_id);
                if (!stored.fileId) throw new Error("录音文件未完成上传。");
                const recording = await recordingService.create(title, "in_app_recording");
                await recordingService.bindAudio(
                  recording.id,
                  stored.fileId,
                  audio.durationSeconds,
                );
                setArchiveRecordingId(recording.id);
                setArchiveAudioFileId(stored.fileId);
                setArchiveRecording({
                  title,
                  duration: formatDuration(audio.durationSeconds),
                });
                setArchiveReturn("recording");
                setQuickView("archive");
              } catch (error) {
                showNotice("录音保存失败", errorMessage(error));
              }
            }}
            onNotice={showNotice}
          /> : null}
          {quickView === "recordingRecords" ? (
            <RecordingRecordsScreen
              items={recordingItems}
              loading={recordingsLoading}
              onOpen={(recording) => void openRecording(recording)}
              onUpload={async () => {
                try {
                  const uploaded = await pickAndUploadFile("音频", "recording");
                  if (!uploaded?.stored.fileId) return;
                  const recording = await recordingService.create(
                    uploaded.picked.name.replace(/\.[^.]+$/, ""),
                    "uploaded_audio",
                  );
                  const durationSeconds = await getLocalAudioDurationSeconds(uploaded.picked).catch(() => null);
                  await recordingService.bindAudio(recording.id, uploaded.stored.fileId, durationSeconds);
                  await loadRecordings();
                  showNotice(
                    "录音已上传",
                    durationSeconds
                      ? "录音已记录时长并进入待归档列表，选择档案后开始生成转写和纪要。"
                      : "录音已进入待归档列表；暂未读取到时长，选择档案后仍可继续处理。",
                  );
                } catch (error) {
                  showNotice("录音上传失败", errorMessage(error));
                }
              }}
              onNotice={showNotice}
            />
          ) : null}
          {quickView === "recordingProcessing" ? (
            <RecordingProcessingScreen
              recording={activeRecording}
              job={activeRecordingJob}
              busy={recordingProcessingBusy}
              onRefresh={async () => {
                if (!activeRecording.id) return;
                try {
                  await refreshRecording(activeRecording.id);
                } catch (error) {
                  showNotice("状态刷新失败", errorMessage(error));
                }
              }}
              onRetry={async () => {
                if (!activeRecording.id) return;
                await runRecordingProcessing(
                  activeRecording.id,
                  activeRecording.status === "处理失败",
                );
              }}
              onOpenResult={() => void openRecording(activeRecording)}
            />
          ) : null}
          {quickView === "archive" ? <ArchiveScreen
            recording={archiveRecording}
            audioFileId={archiveAudioFileId}
            profiles={profileItems}
            onNotice={showNotice}
            onArchive={async (input) => {
              if (!archiveRecordingId) {
                throw new Error("录音尚未保存到后端，请重新进入录音流程。");
              }
              const archived = await recordingService.archive(
                archiveRecordingId,
                {
                  profileType: input.kind,
                  profileId: input.profileId,
                  createProfile: input.newProfileName
                    ? { name: input.newProfileName, status: "active" }
                    : undefined,
                  createSession: { summary: input.note },
                },
              );
              // 转写与纪要在后端异步处理，这里刻意不 await：
              // 过去要等整条 AI 流水线跑完才跳转，点击「归档到 XXX」要卡几十秒。
              // 归档完成页会轮询真实状态，处理进度对用户仍然可见。
              void runRecordingProcessing(archiveRecordingId, false).catch(() => undefined);
              await loadProfiles();
              const profileName = input.newProfileName
                ?? profileItems.find((item) => item.id === archived.profile_id)?.name
                ?? "已选档案";
              const kindLabel = input.kind === "client"
                ? "来访者"
                : input.kind === "supervisor"
                  ? "督导师"
                  : "受督者";
              const recordNoun = input.kind === "client"
                ? "咨询"
                : input.kind === "supervisor"
                  ? "受督"
                  : "督导";
              return {
                profileName,
                kindLabel,
                recordLabel: `第 ${archived.sequence_no} 次${recordNoun}`,
                recordingId: archiveRecordingId,
                sessionId: archived.session_id,
                profileId: archived.profile_id,
              };
            }}
            onComplete={(result) => {
              setArchiveResult(result);
              setQuickView("archiveComplete");
            }}
          /> : null}
          {quickView === "archiveComplete" && archiveResult ? (
            <ArchiveCompleteScreen
              result={archiveResult}
              onOpenProfile={() => {
                const storedProfile = profileItems.find((profile) => profile.name === archiveResult.profileName);
                if (storedProfile) {
                  void openProfile(storedProfile);
                } else {
                  showNotice("档案正在刷新", "请从档案库重新进入刚创建的档案。");
                  void loadProfiles();
                }
              }}
              onOpenRecords={() => setQuickView("recordingRecords")}
            />
          ) : null}
          {quickView === "supervision" ? <SupervisionScreen profiles={profileItems} onNotice={showNotice} /> : null}
          {quickView === "profileUnlock" && pendingProfile ? (
            <ProfileUnlockScreen
              profile={pendingProfile}
              passwordSet={profilePasswordSet}
              grantMinutes={profileAccessGrantMinutes}
              onSubmit={async (password) => {
                try {
                  const kind = archiveKindForProfile(pendingProfile);
                  if (!profilePasswordSet) {
                    await profileAccessService.setPassword(kind, password);
                  }
                  await profileAccessService.verify(kind, password);
                  setUnlockedProfileId(pendingProfile.id);
                  selectProfile(pendingProfile);
                  if (pendingRecordingAfterUnlock) {
                    await loadRecordingDetail(pendingRecordingAfterUnlock);
                    setRecordingDetailReturn(pendingRecordingReturn);
                    setPendingRecordingAfterUnlock(null);
                    setPendingProfile(null);
                    setQuickView("recordingDetail");
                  } else {
                    setPendingProfile(null);
                    setQuickView(pendingProfileDestination);
                  }
                } catch (error) {
                  showNotice("档案验证失败", errorMessage(error));
                }
              }}
            />
          ) : null}
          {quickView === "profileDetail" ? (
            <ProfileDetailScreen
              profile={activeProfile}
              sessions={sessionHistory}
              legalAttachments={legalAttachments}
              onUpdateNextSession={async (nextSessionAt) => {
                try {
                  const updated = await profileService.update(activeProfileId, { nextSessionAt });
                  setProfileItems((current) => current.map((item) => item.id === updated.id ? updated : item));
                  selectProfile(updated);
                  showNotice("下次时间已更新", "档案卡片和日程已同步。");
                } catch (error) {
                  showNotice("下次时间保存失败", errorMessage(error));
                  throw error;
                }
              }}
              onUpdateFrequency={async (frequency) => {
                try {
                  const updated = await profileService.update(activeProfileId, { frequency });
                  setProfileItems((current) => current.map((item) => item.id === updated.id ? updated : item));
                  selectProfile(updated);
                  showNotice("咨询频率已更新", "档案卡片已同步。");
                } catch (error) {
                  showNotice("频率保存失败", errorMessage(error));
                  throw error;
                }
              }}
              onUpdateDetails={async (patch) => {
                try {
                  const updated = await profileService.update(activeProfileId, patch);
                  setProfileItems((current) => current.map((item) => item.id === updated.id ? updated : item));
                  selectProfile(updated);
                  showNotice("基本信息已更新", "档案详情与档案卡片已同步。");
                } catch (error) {
                  showNotice("基本信息保存失败", errorMessage(error));
                  throw error;
                }
              }}
              onCreateSession={async (input) => {
                try {
                  const created = await sessionService.create(activeProfileId, input);
                  await loadProfileData(activeProfileId);
                  showNotice(`已新增第 ${created.sequence} 次记录`, "记录已保存到后端数据库。");
                  if (systemCalendarEnabled) {
                    void syncPendingCalendarEvents()
                      .then(() => loadProfileData(activeProfileId))
                      .catch((error) => showNotice("系统日历同步失败", errorMessage(error)));
                  }
                } catch (error) {
                  showNotice("记录创建失败", errorMessage(error));
                  throw error;
                }
              }}
              onUpdateSession={async (sessionId, patch) => {
                try {
                  await sessionService.update(sessionId, patch);
                  await loadProfileData(activeProfileId);
                  if (systemCalendarEnabled && patch.occurredAt) {
                    void syncPendingCalendarEvents()
                      .then(() => loadProfileData(activeProfileId))
                      .catch((error) => showNotice("系统日历同步失败", errorMessage(error)));
                  }
                } catch (error) {
                  showNotice("记录更新失败", errorMessage(error));
                  throw error;
                }
              }}
              onDeleteSession={async (sessionId) => {
                try {
                  await sessionService.delete(sessionId);
                  await loadProfileData(activeProfileId);
                  showNotice("记录已删除", "后端记录及其关联关系已更新。");
                } catch (error) {
                  showNotice("记录删除失败", errorMessage(error));
                  throw error;
                }
              }}
              onUploadLegal={async (title, category, existing) => {
                try {
                  const uploaded = await pickAndUploadFile("PDF");
                  if (!uploaded?.stored.fileId) return;
                  const attachment = existing
                    ? await attachmentService.replaceProfile(existing.id, uploaded.stored.fileId)
                    : await attachmentService.createProfile({
                        profileId: activeProfileId,
                        category,
                        fileId: uploaded.stored.fileId,
                      });
                  setLegalAttachments((current) => [
                    attachment,
                    ...current.filter((item) => item.category !== category),
                  ]);
                  showNotice(existing ? "法律文件已替换" : "法律文件已上传", `${title}已安全上传并绑定当前档案。`);
                } catch (error) {
                  showNotice("法律文件上传失败", errorMessage(error));
                  throw error;
                }
              }}
              onOpenRecord={(sessionId) => void openSessionRecord(sessionId, "profileDetail")}
              hasCaseReport={Boolean(activeCaseReportId)}
              onOpenCaseReport={() => {
                if (activeCaseReportId) {
                  void reportService.get(activeCaseReportId).then((report) => {
                    const blocks = Array.isArray(report.draftContent?.blocks)
                      ? report.draftContent.blocks as Array<{ title?: string; content?: string }>
                      : [];
                    setCaseReportSections(blocks.map((block) => ({
                      title: block.title ?? "未命名章节",
                      content: block.content ?? "",
                    })));
                    setCaseReportFormal(Boolean(report.formalSavedAt));
                    setQuickView("caseReportEditor");
                  }).catch((error) => {
                    showNotice("个案报告加载失败", errorMessage(error));
                  });
                  return;
                }
                void reportService.generationSources({
                  reportType: "case_report",
                  profileId: activeProfileId,
                }).then((sources) => {
                  setCaseReportSources(sources);
                  setCaseReportFormal(false);
                  setQuickView("caseReportSelect");
                }).catch((error) => {
                  showNotice("报告资料加载失败", errorMessage(error));
                });
              }}
              onOpenMaterial={(category, sessionId) => openMaterials(category, sessionId)}
              onPreviewLegal={(attachment) => openFilePreview({
                id: attachment.id,
                ownerKey: attachment.category,
                title: attachment.title,
                meta: attachment.meta,
                fileType: attachment.meta.split(" · ")[0],
                source: "legal",
                file: attachment.file,
              }, "profileDetail")}
              onOpenPrivacy={() => setQuickView("profilePrivacy")}
              onNotice={showNotice}
            />
          ) : null}
          {quickView === "profileCreate" ? (
            <ProfileCreateScreen
              profiles={profileItems}
              onNotice={showNotice}
              onCreate={async (input) => {
                try {
                  const profile = await profileService.create({
                    type: input.kind,
                    name: input.name,
                    code: input.code || undefined,
                    status: input.status,
                    crisisLevel: input.crisisLevel,
                    initialSessionCount: input.initialSessionCount,
                    nextSessionAt: normalizeSessionDate(input.next) || undefined,
                    metadata: { ...input.metadata, frequency: input.frequency },
                    notes: input.notes,
                  });
                  setProfileItems((current) => [profile, ...current]);
                  await openProfile(profile);
                } catch (error) {
                  showNotice("档案创建失败", errorMessage(error));
                }
              }}
            />
          ) : null}
          {quickView === "recordingDetail" ? (
            <RecordingDetailScreen
              recording={activeRecording}
              summary={recordingSummary}
              chapters={recordingChapters}
              turns={recordingTurns}
              hasManualEdits={recordingHasEdits}
              onOpenRecord={() => {
                if (activeRecording.sessionId) {
                  void openSessionRecord(activeRecording.sessionId, "recordingDetail");
                } else {
                  showNotice("请先归档录音", "录音归档到某次记录后，才能基于本次资料生成记录草稿。");
                }
              }}
              onOpenChapters={() => setQuickView("chapterEditor")}
              onOpenTranscript={() => setQuickView("transcriptEditor")}
              onRegenerated={async () => {
                if (!activeRecording.id) return;
                try {
                  await recordingService.regenerateSummary(activeRecording.id, recordingHasEdits);
                  await loadRecordingDetail(activeRecording);
                  showNotice("重新生成任务已完成", "纪要和章节已从后端更新；原正式记录未被覆盖。");
                } catch (error) {
                  showNotice("重新生成失败", errorMessage(error));
                  throw error;
                }
              }}
              onNotice={showNotice}
              onOpenPrivacy={() => openPrivacy("recordingDetail")}
            />
          ) : null}
          {quickView === "chapterEditor" ? (
            <ChapterEditorScreen
              chapters={recordingChapters}
              onChange={(index, chapter) => {
                setRecordingChapters((current) => updateAtIndex(current, index, chapter));
                setRecordingHasEdits(true);
              }}
              onSave={async () => {
                if (!activeRecording.id) return;
                try {
                  await recordingService.updateSummary(
                    activeRecording.id,
                    recordingSummary,
                    recordingChapters.map((chapter) => ({
                      start_ms: parseDuration(chapter.time) * 1000,
                      title: chapter.title,
                    })),
                  );
                  setQuickView("recordingDetail");
                  showNotice("章节已保存", "章节标题和时间点已同步到后端录音纪要。");
                } catch (error) {
                  showNotice("章节保存失败", errorMessage(error));
                  throw error;
                }
              }}
            />
          ) : null}
          {quickView === "transcriptEditor" ? (
            <TranscriptEditorScreen
              turns={recordingTurns}
              onRenameSpeaker={(speakerKey, speaker) => {
                setRecordingTurns((current) => current.map((turn) => (
                  turn.speakerKey === speakerKey ? { ...turn, speaker } : turn
                )));
                setRecordingHasEdits(true);
              }}
              onChange={(index, turn) => {
                setRecordingTurns((current) => updateAtIndex(current, index, turn));
                setRecordingHasEdits(true);
              }}
              onSave={async () => {
                if (!activeRecording.id) return;
                const speakerUpdates = new Map<string, string>();
                recordingTurns.forEach((turn) => {
                  if (turn.speakerKey) speakerUpdates.set(turn.speakerKey, turn.speaker);
                });
                try {
                  await Promise.all([
                    ...recordingTurns
                      .filter((turn): turn is EditableTranscriptTurn & { id: string } => Boolean(turn.id))
                      .map((turn) => recordingService.updateSegment(turn.id, turn.text)),
                    ...[...speakerUpdates].map(([speakerKey, speaker]) => (
                      recordingService.updateSpeaker(activeRecording.id!, speakerKey, speaker)
                    )),
                  ]);
                  setQuickView("recordingDetail");
                  showNotice("转写校对已保存", "最新发言人与文本已保存到后端。");
                } catch (error) {
                  showNotice("转写保存失败", errorMessage(error));
                  throw error;
                }
              }}
            />
          ) : null}
          {quickView === "sessionMaterials" ? (
            <SessionMaterialsScreen
              category={activeMaterialCategory}
              materials={sessionMaterials.filter((item) => item.sessionId === activeSessionId && item.category === activeMaterialCategory)}
              onOpenRecording={() => {
                resetRecordingEditor(activeRecording);
                setQuickView("recordingDetail");
              }}
              onPreview={(material) => openFilePreview({
                id: material.id,
                title: material.title,
                meta: material.meta,
                fileType: material.meta.split(" · ")[0],
                source: "material",
                file: material.file,
              }, "sessionMaterials")}
              onAdd={async (fileType) => {
                try {
                  const uploaded = await pickAndUploadFile(
                    fileType,
                    activeMaterialCategory === "recording" ? "recording" : "attachment",
                  );
                  if (!uploaded?.stored.fileId) return;
                  if (activeMaterialCategory === "recording") {
                    const recording = await recordingService.create(
                      uploaded.picked.name.replace(/\.[^.]+$/, ""),
                      "uploaded_audio",
                    );
                    await recordingService.bindAudio(
                      recording.id,
                      uploaded.stored.fileId,
                      await getLocalAudioDurationSeconds(uploaded.picked).catch(() => null),
                    );
                    await recordingService.archive(recording.id, {
                      profileType: archiveKindForLabel(activeProfile.kindLabel),
                      profileId: activeProfileId,
                      sessionId: activeSessionId,
                    });
                    await recordingService.process(recording.id, "archived_context");
                    const response = await recordingService.list({ pageSize: 100 });
                    const recordingRows = response.items.map(mapRecordingItem);
                    setRecordingItems(recordingRows);
                    await loadProfileData(activeProfileId, recordingRows);
                    showNotice("录音已上传并处理", "原始录音已归档，转写和纪要已由后端生成。");
                    const createdRecording = recordingRows.find((item) => item.id === recording.id);
                    if (createdRecording) {
                      await openRecording(createdRecording);
                    }
                    return;
                  }
                  const material = await attachmentService.create({
                    sessionId: activeSessionId,
                    category: activeMaterialCategory,
                    fileId: uploaded.stored.fileId,
                  });
                  setSessionMaterials((current) => [material, ...current]);
                  await loadProfileData(activeProfileId);
                  showNotice("资料已上传", getMaterialUpdateMessage(activeMaterialCategory));
                } catch (error) {
                  showNotice("资料上传失败", errorMessage(error));
                }
              }}
              onSelectUnarchived={async (recordingId) => {
                try {
                  await recordingService.archive(recordingId, {
                    profileType: archiveKindForLabel(activeProfile.kindLabel),
                    profileId: activeProfileId,
                    sessionId: activeSessionId,
                  });
                  void recordingService.process(recordingId, "archived_context").catch(() => undefined);
                  const response = await recordingService.list({ pageSize: 100 });
                  const recordingRows = response.items.map(mapRecordingItem);
                  setRecordingItems(recordingRows);
                  await loadProfileData(activeProfileId, recordingRows);
                  showNotice("录音已归入本次记录", "转写和纪要正在后台生成，可在录音记录中查看进度。");
                  const archivedRecording = recordingRows.find((item) => item.id === recordingId);
                  if (archivedRecording) {
                    await openRecording(archivedRecording);
                  }
                } catch (error) {
                  showNotice("录音归档失败", errorMessage(error));
                  throw error;
                }
              }}
              onStartRecording={() => setQuickView("recording")}
              onAuthorize={() => openPrivacy("sessionMaterials")}
            />
          ) : null}
          {quickView === "filePreview" && activeFile ? (
            <FilePreviewScreen
              file={activeFile}
              onNotice={showNotice}
              onUpdate={async (_title, fileType) => {
                if (activeFile.source === "material") {
                  try {
                    const uploaded = await pickAndUploadFile(fileType);
                    if (!uploaded?.stored.fileId) return;
                    const replacement = await attachmentService.replace(
                      activeFile.id,
                      uploaded.stored.fileId,
                    );
                    setSessionMaterials((current) => current.map(
                      (item) => item.id === replacement.id ? replacement : item,
                    ));
                    await loadProfileData(activeProfileId);
                    setActiveFile({
                      id: replacement.id,
                      title: replacement.title,
                      meta: replacement.meta,
                      fileType: replacement.meta.split(" · ")[0],
                      source: "material",
                      file: replacement.file,
                    });
                    showNotice("文件已替换", "旧文件已销毁，新文件已绑定到当前资料。");
                  } catch (error) {
                    showNotice("文件替换失败", errorMessage(error));
                    throw error;
                  }
                  return;
                }
                try {
                  const uploaded = await pickAndUploadFile(fileType);
                  if (!uploaded?.stored.fileId) return;
                  const replacement = await attachmentService.replaceProfile(
                    activeFile.id,
                    uploaded.stored.fileId,
                  );
                  setLegalAttachments((current) => current.map(
                    (item) => item.id === replacement.id ? replacement : item,
                  ));
                  setActiveFile({
                    id: replacement.id,
                    ownerKey: replacement.category,
                    title: replacement.title,
                    meta: replacement.meta,
                    fileType: replacement.meta.split(" · ")[0],
                    source: "legal",
                    file: replacement.file,
                  });
                  showNotice("法律文件已替换", "旧文件已销毁，新文件已绑定当前档案。");
                } catch (error) {
                  showNotice("法律文件替换失败", errorMessage(error));
                  throw error;
                }
              }}
              onDelete={async () => {
                try {
                  await attachmentService.delete(activeFile.id);
                  if (activeFile.source === "material") {
                    setSessionMaterials((current) => removeSessionMaterial(current, activeFile.id));
                    await loadProfileData(activeProfileId);
                  } else {
                    setLegalAttachments((current) => current.filter((item) => item.id !== activeFile.id));
                  }
                } catch (error) {
                  showNotice("文件删除失败", errorMessage(error));
                  throw error;
                }
                setQuickView(filePreviewReturn);
                showNotice("文件已删除", "文件已从当前资料列表移除，此操作不可恢复。");
              }}
            />
          ) : null}
          {quickView === "recordEditor" ? <RecordEditorScreen
            profile={activeProfile}
            recordLabel={activeRecordLabel}
            sections={recordEditorSections}
            formal={recordFormal}
            dirty={recordDirty}
            onSectionsChange={setRecordEditorSections}
            onFormalChange={async (next: boolean) => {
              if (next === recordFormal) return;
              if (next && !activeRecordReport?.formalSavedAt) {
                showNotice("尚无正式版", "请先保存草稿为正式版，再切换查看。");
                return;
              }
              const source = next ? activeRecordReport?.formalContent : activeRecordReport?.draftContent;
              if (source && Array.isArray((source as { blocks?: unknown[] }).blocks)) {
                setRecordEditorSections(
                  ((source as { blocks: Array<{ title?: string; content?: string }> }).blocks).map((block) => ({
                    title: block.title ?? "未命名章节",
                    content: block.content ?? "",
                  })),
                );
              }
              setRecordFormal(next);
            }}
            onDirtyChange={setRecordDirty}
            onSaveFormal={async () => {
              if (!activeRecordReportId) throw new Error("记录尚未绑定后端报告。");
              await reportService.update(activeRecordReportId, {
                content: { blocks: recordEditorSections },
              });
              await reportService.saveFormal(activeRecordReportId, true);
              setSessionHistory((current) => current.map((session) => (
                session.id === activeSessionId ? { ...session, record: "正式版" } : session
              )));
            }}
            onCopyFormalToDraft={async () => {
              if (!activeRecordReportId) return;
              const report = await reportService.copyFormalToDraft(activeRecordReportId);
              setRecordEditorSections(sectionsFromReport(report, false));
            }}
            onRegenerateDraft={async () => {
              if (!activeRecordReportId || !activeSessionId) return;
              const reportType = getReportType(activeProfile.kindLabel);
              setPendingReportGeneration({
                mode: "regenerate",
                sessionId: activeSessionId,
                returnView: "recordEditor",
                reportType,
                reportId: activeRecordReportId,
                recordType: getRecordType(activeProfile.kindLabel),
                sources: [],
                loading: true,
              });
              setQuickView("reportGeneration");
            }}
            onDownload={async () => {
              if (!activeRecordReportId) return;
              const exported = await reportService.export(
                activeRecordReportId,
                "pdf",
                recordFormal ? "formal" : "draft",
              );
              const download = await fileService.getDownloadUrl(exported.fileId);
              await downloadAndShareFile(
                download.download_url,
                `${activeProfile.profileName}-${activeRecordLabel}.pdf`,
                "application/pdf",
              );
            }}
            onOpenPrivacy={() => openPrivacy("recordEditor")} onNotice={showNotice} /> : null}
          {quickView === "caseReportSelect" ? <CaseReportMaterialScreen
            profile={activeProfile}
            sources={caseReportSources}
            onGenerate={async (selected, options) => {
              const generated = await reportService.generate({
                reportType: "case_report",
                profileId: activeProfileId,
                selectedSources: selected.map((source) => ({
                  resourceType: source.resourceType,
                  resourceId: source.resourceId,
                })),
                confirmOverwriteDraft: options?.confirmOverwriteDraft,
              });
              const report = await reportService.get(generated.reportId);
              const blocks = Array.isArray(report.draftContent.blocks)
                ? report.draftContent.blocks as Array<{ title?: string; content?: string }>
                : [];
              setActiveCaseReportId(report.id);
              setCaseReportSections(blocks.map((block) => ({
                title: block.title ?? "未命名章节",
                content: block.content ?? "",
              })));
              setCaseReportFormal(false);
              setQuickView("caseReportEditor");
            }}
            onNotice={showNotice}
          /> : null}
          {quickView === "caseReportEditor" ? <CaseReportEditorScreen
            profile={activeProfile}
            sections={caseReportSections}
            formal={caseReportFormal}
            onSectionsChange={setCaseReportSections}
            onFormalChange={setCaseReportFormal}
            onSaveFormal={async () => {
              if (!activeCaseReportId) return;
              await reportService.update(activeCaseReportId, {
                content: { blocks: caseReportSections },
              });
              await reportService.saveFormal(activeCaseReportId, true);
            }}
            onCopyFormalToDraft={async () => {
              if (!activeCaseReportId) return;
              const report = await reportService.copyFormalToDraft(activeCaseReportId);
              const blocks = Array.isArray(report.draftContent.blocks)
                ? report.draftContent.blocks as Array<{ title?: string; content?: string }>
                : [];
              setCaseReportSections(blocks.map((block) => ({
                title: block.title ?? "未命名章节",
                content: block.content ?? "",
              })));
            }}
            onDownload={async () => {
              if (!activeCaseReportId) return;
              const exported = await reportService.export(
                activeCaseReportId,
                "pdf",
                caseReportFormal ? "formal" : "draft",
              );
              const download = await fileService.getDownloadUrl(exported.fileId);
              await downloadAndShareFile(
                download.download_url,
                `${activeProfile.profileName}-个案报告.pdf`,
                "application/pdf",
              );
            }}
            onOpenPrivacy={() => openPrivacy("caseReportEditor")} onNotice={showNotice} /> : null}
          {quickView === "privacyCenter" ? (
            <PrivacyCenterScreen
              onNotice={showNotice}
            />
          ) : null}
          {quickView === "profilePrivacy" && activeProfileId ? (
            <ProfilePrivacyScreen
              profileId={activeProfileId}
              profileName={activeProfile.profileName}
              profileType={activeProfile.kindLabel}
              onNotice={showNotice}
            />
          ) : null}
          {quickView === "reportGeneration" && pendingReportGeneration ? (
            <ReportGenerationScreen
              pending={pendingReportGeneration}
              busy={reportGenerationBusy}
              onCancel={() => {
                if (reportGenerationBusy) return;
                const returnView = pendingReportGeneration.returnView;
                setPendingReportGeneration(null);
                setQuickView(returnView);
              }}
              onConfirm={() => void confirmReportGeneration()}
              onRetry={() => {
                setPendingReportGeneration(retryReportGenerationLoad);
              }}
            />
          ) : null}
          {quickView === "articleDetail" ? <ArticleDetailScreen article={activeArticle} /> : null}
          {quickView === "statistics" ? <StatisticsScreen durationStats={recordingDurationStats} /> : null}
          {quickView === "schedule" ? <ScheduleScreen onStartRecording={() => setQuickView("recording")} onNotice={showNotice} /> : null}
          {quickView === "securitySettings" ? (
            <SecuritySettingsScreen
              initialSection={securityInitialSection}
              onNotice={showNotice}
              onDeleteAccount={async (password) => {
                await authService.deleteAccount(password);
                apiClient.setTokens("demo-token", null);
                profileAccessService.clearGrants();
                await authSessionStore.clear();
                setCurrentUser(null);
                setProfileItems([]);
                setTab("home");
                setQuickView("overview");
                setAuthStatus("guest");
              }}
            />
          ) : null}
          {tab === "profiles" && quickView === "overview" ? (
            <ProfilesScreen
              profiles={profileItems}
              loading={profilesLoading}
              error={profilesError}
              onRetry={() => void loadProfiles()}
              onOpenDetail={openProfile}
              onCreate={() => setQuickView("profileCreate")}
            />
          ) : null}
          {tab === "recordings" && quickView === "overview" ? (
            <ContentScreen onOpen={(article) => {
              setActiveArticle(article);
              setQuickView("articleDetail");
            }} />
          ) : null}
          {tab === "account" && quickView === "overview" ? (
            <AccountScreen
              user={currentUser}
              onOpenPrivacy={() => openPrivacy("overview")}
              onOpenProfilePrivacy={(profileId) => {
                const target = profileItems.find((item) => item.id === profileId);
                if (!target) {
                  showNotice("档案不可用", "请从档案库进入该档案后管理隐私。");
                  return;
                }
                void openProfile(target, "profilePrivacy");
              }}
              onOpenSecurity={(section = "profileAccess") => {
                setSecurityInitialSection(section);
                setQuickView("securitySettings");
              }}
              onNotice={showNotice}
              onUpdateProfile={async (displayName) => {
                const updated = await authService.updateMe(displayName);
                setCurrentUser(updated);
              }}
              onLogout={async () => {
                try {
                  if (refreshToken) await authService.logout(refreshToken);
                } finally {
                  apiClient.setTokens("demo-token", null);
                  profileAccessService.clearGrants();
                  await authSessionStore.clear();
                  setCurrentUser(null);
                  setProfileItems([]);
                  setTab("home");
                  setQuickView("overview");
                  setAuthStatus("guest");
                }
              }}
            />
          ) : null}
        </ScrollView>
        {!hideBottomTabs ? (
          <BottomTabs
            active={tab}
            onChange={(next) => {
              setQuickView("overview");
              setTab(next);
            }}
          />
        ) : null}
        {notice ? <ActionNotice notice={notice} onClose={() => setNotice(null)} /> : null}
      </View>
      </SafeAreaView>
    </AppErrorBoundary>
  );
}

function AuthScreen({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, displayName: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const authShellWidth = Math.max(280, Math.min(width - 48, 430));
  const canSubmit = email.trim().includes("@")
    && password.length >= 6
    && (mode === "login" || displayName.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await onLogin(email.trim().toLowerCase(), password);
      } else {
        await onRegister(email.trim().toLowerCase(), password, displayName.trim());
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "登录服务暂不可用，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };
  const handleWechat = async () => {
    if (Platform.OS === "web") {
      try {
        const res = await fetch(`${configuredApiBaseUrl()}/auth/wechat/status`);
        const data = await res.json() as { web?: boolean };
        if (!data.web) {
          setError("微信网页登录尚未配置，请在 backend/.env 填写 AppID/Secret 并重启后端。");
          return;
        }
      } catch {
        // 检测失败不阻断，直接跳转由后端处理
      }
      window.location.href = `${configuredApiBaseUrl()}/auth/wechat/web/authorize`;
      return;
    }
    setError("原生端微信登录需先接入微信 SDK（见 docs/wechat-login.md）。");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.authShell, { width: authShellWidth }]}>
        <View style={styles.authBrand}>
          <View style={styles.authBrandIcon}>
            <ShieldCheck size={27} color={colors.clayDark} />
          </View>
          <Text style={styles.kicker}>咨询师助手</Text>
          <Text style={styles.authTitle}>{mode === "login" ? "欢迎回来" : "创建安全工作空间"}</Text>
          <Text style={styles.authCopy}>
            {mode === "login"
              ? "登录后访问你的档案、录音、报告与督导记录。"
              : "账号数据存储在后端，档案访问密码按类型独立保护。"}
          </Text>
        </View>
        <View style={styles.authCard}>
          {mode === "register" ? (
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="姓名或工作称呼"
              placeholderTextColor={colors.subtle}
              style={styles.profileFormInput}
              textContentType="name"
            />
          ) : null}
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="邮箱"
            placeholderTextColor={colors.subtle}
            style={styles.profileFormInput}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "login" ? "密码" : "密码（至少 8 位）"}
            placeholderTextColor={colors.subtle}
            style={styles.profileFormInput}
            secureTextEntry
            textContentType={mode === "login" ? "password" : "newPassword"}
          />
          {error ? <Text style={styles.authError}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.primaryButton, styles.wideButton, !canSubmit && styles.pendingPrimaryButton]}
            activeOpacity={0.78}
            disabled={!canSubmit || submitting}
            onPress={() => void submit()}
          >
            {submitting ? <ActivityIndicator color="#FFF9F3" /> : <LockKeyhole size={18} color="#FFF9F3" />}
            <Text style={styles.primaryButtonText}>
              {submitting ? "正在验证..." : mode === "login" ? "安全登录" : "创建账号"}
            </Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 14 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            <Text style={{ marginHorizontal: 10, color: colors.subtle, fontSize: 12 }}>或</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", height: 50, borderRadius: 12, backgroundColor: "#07C160" }}
            activeOpacity={0.85}
            onPress={handleWechat}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>微信登录</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              setMode((current) => current === "login" ? "register" : "login");
              setError(null);
            }}
          >
            <Text style={styles.authSwitch}>
              {mode === "login" ? "还没有账号？创建账号" : "已有账号？返回登录"}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.authFootnote}>开发演示账号：user@163.com / 123456</Text>
      </View>
    </SafeAreaView>
  );
}

function Header({ title, quickView, onBack, onOpenSchedule }: { title: string; quickView: QuickView; onBack: () => void; onOpenSchedule: () => void }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.kicker}>咨询师助手</Text>
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
      {quickView === "overview" ? (
        <TouchableOpacity style={styles.roundButton} activeOpacity={0.75} onPress={onOpenSchedule}>
          <Bell size={19} color={colors.clayDark} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.textButton} activeOpacity={0.75} onPress={onBack}>
          <Text style={styles.textButtonLabel}>返回</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function HomeScreen({
  profiles,
  recordings: recordingRows,
  durationStats,
  events,
  onOpen,
  onOpenProfiles,
  onOpenSchedule,
  onOpenStatistics,
}: {
  profiles: ProfileListItem[];
  recordings: RecordingItem[];
  durationStats: RecordingDurationStatistics | null;
  events: CalendarEvent[];
  onOpen: (view: QuickView) => void;
  onOpenProfiles: () => void;
  onOpenSchedule: () => void;
  onOpenStatistics: () => void;
}) {
  const categoryLabels: Record<string, string> = {
    counseling: "咨询",
    supervision_received: "接受督导",
    supervision_provided: "提供督导",
    personal: "个人安排",
  };
  const upcoming = [...events]
    .filter((event) => event.status === "pending" && new Date(event.endAt ?? event.startAt).getTime() >= Date.now())
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
  const todayKey = new Date().toDateString();
  const todayEvents = upcoming.filter((event) => new Date(event.startAt).toDateString() === todayKey);
  const nextEvent = upcoming[0];
  const pendingRecordings = recordingRows.filter(
    (recording) => recording.archive === "待归档" || recording.status !== "可查看",
  );
  const metricCards = ([
    { label: "咨询小时", kind: "client" as const },
    { label: "受督小时", kind: "supervisor" as const },
    { label: "督导小时", kind: "supervisee" as const },
  ]).map((metric) => {
    const stat = recordingDurationStat(durationStats, metric.kind);
    return { label: metric.label, value: `${(stat.seconds / 3600).toFixed(1)}h` };
  });
  return (
    <View style={styles.stack}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>今日提醒</Text>
            <Text style={styles.heroTitle}>{todayEvents.length} 个安排待处理</Text>
          </View>
          <CalendarDays size={24} color="#FFF9F3" />
        </View>
        <Text style={styles.heroCopy}>
          {nextEvent
            ? `${nextEvent.title}将在${new Date(nextEvent.startAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}开始。`
            : "近期没有待处理日程，可以直接开始录音或整理档案。"}
        </Text>
        <View style={styles.heroActions}>
          <PrimaryButton icon={Mic} label="开始录音" onPress={() => onOpen("recording")} />
        </View>
      </View>

      <View style={styles.quickGrid}>
        <QuickAction icon={Mic} label="录音记录" detail={`${pendingRecordings.length} 条待处理`} onPress={() => onOpen("recordingRecords")} />
        <QuickAction icon={FolderOpen} label="档案库" detail={`${profiles.length} 个档案`} onPress={onOpenProfiles} />
        <QuickAction icon={Sparkles} label="智能督导" detail="仅读取已选资料" onPress={() => onOpen("supervision")} />
      </View>

      <SectionHeader title="累计统计" action="明细" onAction={onOpenStatistics} />
      <View style={styles.metricRow}>
        {metricCards.map((item) => (
          <View key={item.label} style={styles.metricCard}>
            <Text style={styles.metricValue}>{item.value}</Text>
            <Text style={styles.metricLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="近期任务" action="完整日程" onAction={onOpenSchedule} />
      <View style={styles.cardStack}>
        {upcoming.slice(0, 3).map((item) => (
          <TouchableOpacity key={item.id} style={styles.listCard} activeOpacity={0.78} onPress={onOpenSchedule}>
            <View style={styles.timePill}>
              <Text style={styles.timePillText}>
                {new Date(item.startAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listMeta}>{categoryLabels[item.category] ?? item.category} · {item.systemCalendarEventId ? "手机日历已同步" : "仅 App 内"}</Text>
            </View>
            <ChevronRight size={18} color={colors.subtle} />
          </TouchableOpacity>
        ))}
        {upcoming.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <CalendarDays size={20} color={colors.subtle} />
            <Text style={styles.emptySearchTitle}>近期没有待处理日程</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RecordingScreen({
  onCancel,
  onSave,
  onNotice,
}: {
  onCancel: () => void;
  onSave: (audio: RecordedLocalAudio) => Promise<void>;
  onNotice: (title: string, detail: string) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const controller = useMemo(
    () => createAudioRecordingController(createExpoAudioDriver(
      recorder,
      recordingMimeType(Platform.OS),
    )),
    [recorder],
  );
  const [recordingState, setRecordingState] = useState<"starting" | "recording" | "paused" | "saving" | "failed">("starting");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const onNoticeRef = useRef(onNotice);

  useEffect(() => {
    onNoticeRef.current = onNotice;
  }, [onNotice]);

  const beginRecording = useCallback((isActive: () => boolean = () => true) => {
    setRecordingState("starting");
    setRecordingError(null);
    void controller.start()
      .then(() => {
        if (isActive()) setRecordingState("recording");
      })
      .catch((error) => {
        if (isActive()) {
          const message = error instanceof Error ? error.message : "请检查麦克风权限。";
          setRecordingState("failed");
          setRecordingError(message);
          onNoticeRef.current("无法开始录音", message);
        }
      });
  }, [controller]);

  useEffect(() => {
    let active = true;
    beginRecording(() => active);
    return () => {
      active = false;
    };
  }, [beginRecording]);

  useEffect(() => {
    if (recordingState !== "recording") return;
    const interval = setInterval(
      () => setElapsedSeconds((current) => current + 1),
      1000,
    );
    return () => clearInterval(interval);
  }, [recordingState]);

  return (
    <View style={styles.stack}>
      <View style={styles.recorderPanel}>
        <View style={styles.recorderRing}>
          <View style={styles.recorderDot} />
          <Text style={styles.recorderTime}>{formatDuration(elapsedSeconds)}</Text>
          <Text style={styles.recorderState}>
            {recordingState === "starting"
              ? "正在准备"
              : recordingState === "failed"
                ? "未开始"
              : recordingState === "paused"
                ? "暂停中"
              : recordingState === "saving"
                  ? "正在保存"
                  : "录音中"}
          </Text>
          {recordingState === "recording" ? (
            <View style={styles.recorderMeter}>
              <View
                style={[
                  styles.recorderMeterFill,
                  {
                    width: `${Math.max(
                      3,
                      Math.min(
                        100,
                        Math.round(((recorderState?.metering ?? -160) + 50) / 50 * 100),
                      ),
                    )}%`,
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.controlRow}>
          <TouchableOpacity style={[styles.cancelButton, confirmCancel && styles.cancelButtonDanger]} activeOpacity={0.75} onPress={() => {
            if (!confirmCancel) {
              setConfirmCancel(true);
              onNotice("再次确认取消", "再次点击确认取消会丢弃当前未保存录音。");
              return;
            }
            void controller.stop().catch(() => undefined).finally(onCancel);
          }}>
            <Text style={[styles.cancelButtonText, confirmCancel && styles.cancelButtonTextDanger]}>{confirmCancel ? "确认取消" : "取消"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pauseButton, (recordingState === "starting" || recordingState === "saving") && styles.pauseButtonDisabled]} activeOpacity={0.75} onPress={() => {
            if (recordingState === "starting" || recordingState === "saving") return;
            if (recordingState === "recording") {
              controller.pause();
              setRecordingState("paused");
              onNotice("录音已暂停", "可继续录制、取消或保存进入归档。");
            } else if (recordingState === "paused") {
              controller.resume();
              setRecordingState("recording");
              onNotice("继续录音", "计时继续，保存后进入归档确认。");
            } else if (recordingState === "failed") {
              beginRecording();
            }
          }}>
            {recordingState === "paused" || recordingState === "failed"
              ? <Play size={22} color="#FFF9F3" fill="#FFF9F3" />
              : <Pause size={22} color="#FFF9F3" fill="#FFF9F3" />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (recordingState === "starting" || recordingState === "saving" || recordingState === "failed") && styles.saveButtonDisabled]}
            activeOpacity={0.75}
            disabled={recordingState === "starting" || recordingState === "saving" || recordingState === "failed"}
            onPress={async () => {
              setRecordingState("saving");
              try {
                await onSave(await controller.stop());
                onNotice("录音已保存", "已写入云端归档队列，可在录音记录中查看并处理；若归档失败会在此提示。");
              } catch (error) {
                setRecordingState("paused");
                onNotice(
                  "录音保存失败",
                  error instanceof Error ? error.message : "请稍后重试。",
                );
              }
            }}
          >
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.noticeCard}>
        {recordingState === "recording" ? (
          <CheckCircle2 size={21} color={colors.sageDark} />
        ) : recordingState === "failed" ? (
          <CircleAlert size={21} color={colors.danger} />
        ) : recordingState === "starting" ? (
          <ActivityIndicator color={colors.clayDark} />
        ) : (
          <Clock3 size={21} color={colors.clayDark} />
        )}
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>
            {recordingState === "recording"
              ? "录音已开始"
              : recordingState === "paused"
                ? "录音已暂停"
                : recordingState === "failed"
                  ? "录音未开始"
                  : recordingState === "saving"
                    ? "正在保存录音"
                    : "正在准备录音"}
          </Text>
          <Text style={styles.listMeta}>
            {recordingState === "recording"
              ? `已录 ${formatDuration(elapsedSeconds)}，音量条实时起伏表示麦克风正在收音；计时持续增长表示正在录制。`
              : recordingState === "paused"
                ? `已录 ${formatDuration(elapsedSeconds)}，继续后会接着录制。`
                : recordingState === "failed"
                  ? recordingError ?? "请检查麦克风权限后重试。"
                  : recordingState === "saving"
                    ? "正在保存到本次录音，保存完成后进入归档。"
                    : "正在请求麦克风并初始化录音设备。"}
          </Text>
        </View>
      </View>

      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>录音保存提示</Text>
        <Text style={styles.privacyCopy}>当前录音保存后会进入归档确认。原始录音云端仅临时保存 14 天，可下载到本地，不支持长期云端保存。</Text>
      </View>
      <View style={styles.noticeCard}>
        <Clock3 size={21} color={colors.sageDark} />
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>录音结束后异步生成</Text>
          <Text style={styles.listMeta}>转写、纪要、章节速览会在保存并归档后生成</Text>
        </View>
      </View>
      {confirmCancel ? (
        <View style={styles.warningPanel}>
          <CircleAlert size={18} color={colors.danger} />
          <Text style={styles.warningText}>当前录音尚未保存。确认取消后，这段录音不会进入录音记录。</Text>
        </View>
      ) : null}
      {recordingState === "failed" && recordingError ? (
        <View style={styles.warningPanel}>
          <CircleAlert size={18} color={colors.danger} />
          <Text style={styles.warningText}>录音尚未开始：{recordingError.replace(/[。.]$/, "")}。可点击中间按钮重新尝试，或返回首页。</Text>
        </View>
      ) : null}
    </View>
  );
}

function RecordingRecordsScreen({
  items,
  loading,
  onOpen,
  onUpload,
  onNotice,
}: {
  items: RecordingItem[];
  loading: boolean;
  onOpen: (recording: RecordingItem) => void;
  onUpload: () => Promise<void>;
  onNotice: (title: string, detail: string) => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        <FileText size={25} color={colors.clayDark} />
        <Text style={styles.posterTitle}>录音记录</Text>
        <Text style={styles.posterCopy}>集中查看待归档、生成中和可查看的录音，不和正在录音流程混在一起。</Text>
      </View>
      <SectionHeader title="录音列表" action={showUpload ? "收起" : "上传"} onAction={() => setShowUpload((current) => !current)} />
      {showUpload ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>上传已有录音</Text>
          <Text style={styles.formHelp}>从系统文件选择器选取音频。文件会安全上传到云端，完成后进入待归档状态，不会自动读取任何档案。</Text>
          <TouchableOpacity
            style={[styles.inlineCreateConfirm, uploading && styles.inlineCreateConfirmDisabled]}
            activeOpacity={0.78}
            disabled={uploading}
            onPress={async () => {
              setUploading(true);
              try {
                await onUpload();
                setShowUpload(false);
              } catch {
                onNotice("录音上传失败", "请检查文件和网络后重试。");
              } finally {
                setUploading(false);
              }
          }}>
            <Text style={styles.inlineCreateConfirmText}>{uploading ? "正在上传..." : "选择并上传音频"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.cardStack}>
        {loading ? (
          <View style={styles.emptySearchCard}>
            <ActivityIndicator color={colors.clayDark} />
            <Text style={styles.emptySearchTitle}>正在加载录音</Text>
          </View>
        ) : null}
        {!loading && items.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <Mic size={20} color={colors.subtle} />
            <Text style={styles.emptySearchTitle}>暂无录音</Text>
            <Text style={styles.emptySearchCopy}>可以开始现场录音，或上传已有音频。</Text>
          </View>
        ) : null}
        {items.map((item) => (
          <TouchableOpacity key={item.id ?? item.title} style={styles.recordingCard} activeOpacity={0.78} onPress={() => onOpen(item)}>
            <View style={styles.recordingIcon}>
              <FileText size={20} color={colors.clayDark} />
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listMeta}>{item.duration} · {item.ttl}</Text>
              <View style={styles.badgeRow}>
                <Badge label={item.status} tone={formatBadge(item.status)} />
                <Badge label={item.archive} tone={formatBadge(item.archive)} />
              </View>
            </View>
            <ChevronRight size={18} color={colors.subtle} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function RecordingAudioPlayer({
  fileId,
  available,
  title,
  fallbackDuration,
  onNotice,
}: {
  fileId: string | null;
  available: boolean;
  title: string;
  fallbackDuration: string;
  onNotice: (title: string, detail: string) => void;
}) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const duration = status.duration > 0
    ? formatDuration(Math.floor(status.duration))
    : fallbackDuration;
  const current = formatDuration(Math.floor(status.currentTime));
  const progress = status.duration > 0
    ? Math.min(100, Math.max(0, (status.currentTime / status.duration) * 100))
    : 0;
  const canPlay = available && Boolean(fileId);

  useEffect(() => {
    if (!fileId || !canPlay) {
      setSourceLoaded(false);
      return;
    }
    let active = true;
    setLoading(true);
    void fileService.getDownloadUrl(fileId)
      .then((result) => {
        if (!active) return;
        setPlaybackUrl(result.download_url);
        if (Platform.OS !== "web") player.replace(result.download_url);
        setSourceLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        onNotice(
          "录音加载失败",
          error instanceof Error ? error.message : "无法加载原始录音。",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      safelyPauseAudioPlayer(player);
    };
  }, [canPlay, fileId, player]);

  useEffect(() => {
    if (Platform.OS !== "web" || !fileId || !canPlay) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fileService.getDownloadUrl(fileId)
          .then((r) => setPlaybackUrl(r.download_url))
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fileId, canPlay]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.audioPlayerCard}>
        <View style={styles.audioPlayerBody}>
          <Text style={styles.audioPlayerTitle}>{title}</Text>
          {playbackUrl && canPlay
            ? createElement("audio", {
                key: playbackUrl,
                controls: true,
                preload: "metadata",
                src: playbackUrl,
                style: { width: "100%", height: 38 },
                onError: () => {
                  fileService.getDownloadUrl(fileId!)
                    .then((r) => setPlaybackUrl(r.download_url))
                    .catch(() => {});
                },
              })
            : (
              <View style={styles.audioUnavailableRow}>
                {loading ? <ActivityIndicator color={colors.clayDark} /> : <CircleAlert size={17} color={colors.subtle} />}
                <Text style={styles.audioPlayerMeta}>
                  {loading ? "正在加载原始录音..." : "原始录音不可用或已销毁"}
                </Text>
              </View>
            )}
          <Text style={styles.audioPlayerMeta}>{fallbackDuration} · 原始录音临时保存</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.audioPlayerCard}>
      <TouchableOpacity
        style={[styles.audioPlayButton, !canPlay && styles.audioPlayButtonDisabled]}
        activeOpacity={0.78}
        disabled={!canPlay || loading}
        accessibilityLabel={status.playing ? "暂停原始录音" : "播放原始录音"}
        onPress={() => {
          if (!fileId || !canPlay || loading) return;
          void toggleAudioPlayback({
            sourceLoaded,
            player,
            loadSource: async () => (await fileService.getDownloadUrl(fileId)).download_url,
            preparePlayback: configureAudioPlaybackMode,
          })
            .then((result) => setSourceLoaded(result.sourceLoaded))
            .catch((error) => onNotice(
              "录音播放失败",
              error instanceof Error ? error.message : "无法加载原始录音。",
            ))
        }}
      >
        {loading
          ? <ActivityIndicator color="#FFF9F3" />
          : status.playing
            ? <Pause size={20} color="#FFF9F3" fill="#FFF9F3" />
            : <Play size={20} color="#FFF9F3" fill="#FFF9F3" />}
      </TouchableOpacity>
      <View style={styles.audioPlayerBody}>
        <Text style={styles.audioPlayerTitle}>{title}</Text>
        <View style={styles.audioProgressTrack}>
          <View style={[styles.audioProgressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.audioPlayerMeta}>
          {canPlay
            ? `${current} / ${duration} · ${status.playing ? "正在播放" : "点击播放原始录音"}`
            : "原始录音不可用或已销毁"}
        </Text>
      </View>
    </View>
  );
}

function RecordingProcessingScreen({
  recording,
  job,
  busy,
  onRefresh,
  onRetry,
  onOpenResult,
}: {
  recording: RecordingItem;
  job: AIJob | null;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onRetry: () => Promise<void>;
  onOpenResult: () => void;
}) {
  const failed = recording.status === "处理失败" || job?.status === "failed";
  const completed = recording.status === "可查看" || job?.status === "completed";
  const pending = recording.status === "待处理";
  const audioAvailable = recordingAudioCanProcess(recording.ttl);
  const title = failed
    ? "录音处理失败"
    : completed
      ? "录音纪要已生成"
      : pending
        ? "录音等待处理"
        : "正在生成录音纪要";
  const detail = failed
    ? recording.processingError ?? job?.error?.message ?? "模型服务暂时不可用，请稍后重试。"
    : completed
      ? "完整转写、录音纪要和章节速览均已保存。"
      : "可以离开此页面，处理完成后会在录音记录和对应档案中更新。";
  return (
    <View style={styles.stack}>
      <View style={styles.noticeCard}>
        {failed
          ? <CircleAlert size={24} color={colors.danger} />
          : completed
            ? <CheckCircle2 size={24} color={colors.sageDark} />
            : <Clock3 size={24} color={colors.clayDark} />}
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>{recording.title}</Text>
          <Text style={styles.listMeta}>{recording.duration} · {recording.archive} · {recording.status}</Text>
        </View>
      </View>
      <View style={styles.processingHero}>
        <View style={styles.processingHeroIcon}>
          {busy
            ? <ActivityIndicator color={colors.clayDark} />
            : failed
              ? <CircleAlert size={28} color={colors.danger} />
              : completed
                ? <CheckCircle2 size={28} color={colors.sageDark} />
                : <RefreshCcw size={28} color={colors.clayDark} />}
        </View>
        <Text style={styles.processingHeroTitle}>{title}</Text>
        <Text style={styles.processingHeroCopy}>{detail}</Text>
      </View>
      <View style={styles.processingList}>
        <ProcessingRow
          title="原始录音"
          detail={recording.ttl}
          status={audioAvailable ? "完成" : "不可用"}
          complete={audioAvailable}
        />
        <ProcessingRow
          title="完整转写"
          detail={failed ? "本次识别未完成" : completed ? "已保存发言人与时间戳" : "正在识别发言人与时间戳"}
          status={failed ? "失败" : completed ? "完成" : pending ? "等待中" : "处理中"}
          complete={completed}
        />
        <ProcessingRow
          title="录音纪要"
          detail={completed ? "已根据完整转写生成" : "等待转写完成后生成"}
          status={failed ? "未生成" : completed ? "完成" : "等待中"}
          complete={completed}
        />
        <ProcessingRow
          title="章节速览"
          detail={completed ? "已生成章节导航" : "等待录音纪要生成"}
          status={failed ? "未生成" : completed ? "完成" : "等待中"}
          complete={completed}
        />
      </View>
      {completed ? (
        <PrimaryButton icon={Eye} label="查看录音纪要" onPress={onOpenResult} wide />
      ) : (
        <PrimaryButton
          icon={RefreshCcw}
          label={busy
            ? "正在处理..."
            : failed && audioAvailable
              ? "重新生成"
              : pending && audioAvailable
                ? "开始生成"
                : "刷新处理状态"}
          onPress={() => {
            if (busy) return;
            void ((failed || pending) && audioAvailable ? onRetry() : onRefresh());
          }}
          wide
        />
      )}
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>处理失败时可重新生成</Text>
        <Text style={styles.privacyCopy}>
          {audioAvailable
            ? "只要原始录音仍在 14 天保存期内，就可以重新生成；原始录音销毁后不能重试。"
            : "当前原始录音不可用，无法重新识别；已生成的转写和纪要仍按各自保存期限管理。"}
        </Text>
      </View>
    </View>
  );
}

function ArchiveScreen({
  recording,
  audioFileId,
  profiles,
  onNotice,
  onArchive,
  onComplete,
}: {
  recording: ArchiveRecording;
  audioFileId: string | null;
  profiles: ProfileListItem[];
  onNotice: (title: string, detail: string) => void;
  onArchive: (input: {
    kind: ArchiveKind;
    profileId?: string;
    newProfileName?: string;
    note: string;
  }) => Promise<ArchiveResult>;
  onComplete: (result: ArchiveResult) => void;
}) {
  const [kind, setKind] = useState<ArchiveKind>("client");
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileNote, setNewProfileNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  type ArchiveCandidateRow = {
    id: string;
    name: string;
    code: string;
    completedCount: number;
    countDetail?: string;
    meta: string;
    next: string;
  };
  const archiveKinds = [
    { key: "client" as const, label: "来访者", detail: "咨询记录" },
    { key: "supervisor" as const, label: "督导师", detail: "受督记录" },
    { key: "supervisee" as const, label: "受督者", detail: "督导记录" },
  ];
  const candidatesByKind = {
    client: profiles.filter((item) => item.type === "来访者"),
    supervisor: profiles.filter((item) => item.type === "督导师"),
    supervisee: profiles.filter((item) => item.type === "受督者"),
  };
  const archiveCandidatesModel: ArchiveCandidateRow[] = candidatesByKind[kind].map((item) => ({
    id: item.id,
    name: item.name,
    code: displayProfileCode(item),
    completedCount: item.latestSequence ?? Number(item.count.match(/\d+/)?.[0] ?? 0),
    countDetail: item.countDetail,
    meta: `${item.status} · ${item.count}${item.countDetail ? ` · ${item.countDetail}` : ""}`,
    next: nextSessionLabel(item.next),
  }));
  const archiveCandidates = filterArchiveCandidates<ArchiveCandidateRow>(
    archiveCandidatesModel,
    searchQuery,
  );
  const selectedCandidate = archiveCandidatesModel.find((item) => item.id === selectedProfile);
  const pendingResult = selectedProfile === "new"
    ? buildArchiveResult({ kind, profileName: newProfileName.trim(), completedCount: 0 })
    : selectedCandidate
      ? buildArchiveResult({ kind, profileName: selectedCandidate.name, completedCount: selectedCandidate.completedCount })
      : null;
  const archiveTarget = describeArchiveTarget(pendingResult);

  return (
    <View style={styles.stack}>
      <View style={styles.noticeCard}>
        <ShieldCheck size={24} color={colors.sageDark} />
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>{recording.title}</Text>
          <Text style={styles.listMeta}>{recording.duration} · 保存后需要选择归属档案</Text>
        </View>
      </View>
      <RecordingAudioPlayer
        fileId={audioFileId}
        available={Boolean(audioFileId)}
        title={recording.title}
        fallbackDuration={recording.duration}
        onNotice={onNotice}
      />

      <SectionHeader title="1 选择归档类型" action="必选" />
      <View style={styles.archiveKindGrid}>
        {archiveKinds.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.archiveKindOption, kind === item.key && styles.archiveKindOptionActive]}
            activeOpacity={0.78}
            onPress={() => {
              setKind(item.key);
              setSelectedProfile(null);
              setCreating(false);
              setSearchQuery("");
              setNewProfileName("");
              setNewProfileNote("");
            }}
          >
            <Text style={[styles.archiveKindTitle, kind === item.key && styles.archiveKindTitleActive]}>{item.label}</Text>
            <Text style={styles.archiveKindDetail}>{item.detail}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionHeader title="2 选择归属档案" action="按姓名 / 编号" />
      <View style={styles.searchBar}>
        <Search size={18} color={colors.subtle} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜索姓名或档案编号"
          placeholderTextColor={colors.subtle}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.cardStack}>
        {archiveCandidates.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.archiveProfileCard, selectedProfile === item.id && styles.archiveProfileCardSelected]}
            activeOpacity={0.78}
            onPress={() => {
              setSelectedProfile(item.id);
              setCreating(false);
              onNotice("已选择归属档案", `${item.name} 将作为这段录音的归档对象。`);
            }}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.name} · {item.code}</Text>
              <Text style={styles.listMeta}>{item.meta} · {item.next}</Text>
            </View>
            {selectedProfile === item.id ? <CheckCircle2 size={19} color={colors.sageDark} /> : <ChevronRight size={18} color={colors.subtle} />}
          </TouchableOpacity>
        ))}
        {archiveCandidates.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <Search size={20} color={colors.subtle} />
            <Text style={styles.emptySearchTitle}>没有找到匹配档案</Text>
            <Text style={styles.emptySearchCopy}>确认姓名或编号无误后，可以直接新增人员。</Text>
          </View>
        ) : null}
      </View>

      {!creating ? (
        <TouchableOpacity style={styles.createInlineButton} activeOpacity={0.78} onPress={() => {
          setCreating(true);
          setSelectedProfile(null);
        }}>
          <Plus size={18} color={colors.clayDark} />
          <Text style={styles.createInlineButtonText}>没有这个人，新增人员</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>新增{archiveKinds.find((item) => item.key === kind)?.label}</Text>
          <Text style={styles.formFieldLabel}>姓名 / 称呼（必填）</Text>
          <TextInput
            value={newProfileName}
            onChangeText={setNewProfileName}
            placeholder="例如：陈雨"
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
          />
          <Text style={styles.formFieldLabel}>本次记录摘要（可选）</Text>
          <TextInput
            value={newProfileNote}
            onChangeText={setNewProfileNote}
            placeholder={kind === "client" ? "本次主诉或咨询目标" : kind === "supervisor" ? "本次受督主题" : "本次督导主题"}
            placeholderTextColor={colors.subtle}
            style={[styles.archiveTextInput, styles.archiveTextArea]}
            multiline
          />
          <TouchableOpacity
            style={[styles.inlineCreateConfirm, !newProfileName.trim() && styles.inlineCreateConfirmDisabled]}
            activeOpacity={0.78}
            onPress={() => {
              if (!newProfileName.trim()) {
                onNotice("请填写姓名", "新增人员至少需要姓名或称呼，其他字段可以稍后补充。");
                return;
              }
              setSelectedProfile("new");
              setCreating(false);
              onNotice("已选中待创建人员", `确认归档后会创建“${newProfileName.trim()}”的基础档案，并把录音作为第 1 次记录。`);
            }}
          >
            <Text style={styles.inlineCreateConfirmText}>选中此新人员</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.archiveTargetCard, pendingResult && styles.archiveTargetCardReady]}>
        <View style={[styles.archiveTargetIcon, pendingResult && styles.archiveTargetIconReady]}>
          {pendingResult ? <CheckCircle2 size={19} color="#FFF9F3" /> : <Clock3 size={19} color={colors.muted} />}
        </View>
        <View style={styles.listBody}>
          <Text style={styles.archiveTargetLabel}>{archiveTarget.title}</Text>
          <Text style={[styles.archiveTargetValue, !pendingResult && styles.archiveTargetValuePending]}>{archiveTarget.value}</Text>
          <Text style={styles.archiveTargetDetail}>{archiveTarget.detail}</Text>
        </View>
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>保存与隐私</Text>
        <Text style={styles.privacyCopy}>原始录音云端仅保存 14 天，不支持长期保存。转写和纪要可在生成后单独授权长期保存。</Text>
      </View>
      <TouchableOpacity
        style={[
          styles.primaryButton,
          styles.wideButton,
          (!pendingResult || submitting) && styles.pendingPrimaryButton,
        ]}
        activeOpacity={0.78}
        disabled={submitting}
        onPress={async () => {
          if (!pendingResult) {
            onNotice("请先选择归属档案", "保存录音后必须选择已有人员，或新增人员后再确认归档。");
            return;
          }
          setSubmitting(true);
          try {
            const result = await onArchive({
              kind,
              profileId: selectedProfile !== "new" ? selectedProfile ?? undefined : undefined,
              newProfileName: selectedProfile === "new" ? newProfileName.trim() : undefined,
              note: newProfileNote.trim(),
            });
            onComplete(result);
          } catch (error) {
            onNotice(
              "录音归档失败",
              error instanceof Error ? error.message : "请稍后重试。",
            );
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <FolderOpen size={18} color="#FFF9F3" />
        <Text style={styles.primaryButtonText}>
          {submitting
            ? "正在归档..."
            : pendingResult
              ? `归档到 ${pendingResult.profileName}`
              : "请先选择档案"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ArchiveCompleteScreen({
  result,
  onOpenProfile,
  onOpenRecords,
}: {
  result: ArchiveResult;
  onOpenProfile: () => void;
  onOpenRecords: () => void;
}) {
  const recordMaterialTitle = result.kindLabel === "来访者" ? "咨询记录材料" : result.kindLabel === "督导师" ? "受督记录材料" : "督导记录材料";
  const recordingId = result.recordingId;
  const [progress, setProgress] = useState<{
    aiStatus: string;
    audioReady: boolean;
    transcriptReady: boolean;
    summaryReady: boolean;
    processingError: string | null;
  } | null>(null);

  useEffect(() => {
    if (!recordingId) return;
    let active = true;
    const load = async () => {
      try {
        const value = await recordingService.status(recordingId);
        if (!active) return;
        setProgress({
          aiStatus: value.aiStatus,
          audioReady: value.audioReady,
          transcriptReady: value.transcriptReady,
          summaryReady: value.summaryReady,
          processingError: value.processingError,
        });
      } catch {
        // 轮询失败时保留上一次状态，下个周期自动重试。
      }
    };
    void load();
    const timer = setInterval(() => {
      void load();
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [recordingId]);

  const aiFailed = progress?.aiStatus === "failed";
  const stageStatus = (ready: boolean | undefined) => {
    if (ready) return { status: "完成", complete: true, failed: false };
    if (aiFailed) return { status: "失败", complete: false, failed: true };
    if (progress?.aiStatus === "processing") return { status: "处理中", complete: false, failed: false };
    return { status: "等待中", complete: false, failed: false };
  };
  const audioStage = stageStatus(progress?.audioReady);
  const transcriptStage = stageStatus(progress?.transcriptReady);
  const summaryStage = stageStatus(progress?.summaryReady);
  const allDone = Boolean(progress?.transcriptReady && progress?.summaryReady);

  return (
    <View style={styles.stack}>
      <View style={styles.archiveSuccessHero}>
        <View style={styles.archiveSuccessIcon}>
          <CheckCircle2 size={34} color="#FFF9F3" />
        </View>
        <Text style={styles.archiveSuccessTitle}>录音已归档</Text>
        <Text style={styles.archiveSuccessCopy}>
          已归入 {result.profileName} 的{result.kindLabel}档案，作为{result.recordLabel}。
        </Text>
      </View>

      <SectionHeader title={allDone ? "后台处理已完成" : "后台处理中"} action="自动更新" />
      <View style={styles.processingList}>
        <ProcessingRow title="原始录音" detail="已保存，13 天后自动销毁" status={audioStage.status} complete={audioStage.complete} />
        <ProcessingRow title="完整转写" detail="识别发言人与时间戳" status={transcriptStage.status} complete={transcriptStage.complete} failed={transcriptStage.failed} />
        <ProcessingRow title="录音纪要" detail="生成摘要与章节速览" status={summaryStage.status} complete={summaryStage.complete} failed={summaryStage.failed} />
        <ProcessingRow title={recordMaterialTitle} detail="将合并量表、作业和其他资料" status="待补充" />
      </View>

      {progress?.processingError ? (
        <View style={styles.ruleCard}>
          <CircleAlert size={19} color={colors.danger} />
          <Text style={styles.warningText}>{progress.processingError}</Text>
        </View>
      ) : null}

      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>归档后仍可补充资料</Text>
        <Text style={styles.privacyCopy}>可进入本次记录继续添加量表、作业和其他材料，再生成完整记录。原始录音不支持长期云端保存。</Text>
      </View>

      <PrimaryButton icon={FolderOpen} label={`查看 ${result.profileName} 的档案`} onPress={onOpenProfile} wide />
      <GhostButton icon={Mic} label="返回录音记录" onPress={onOpenRecords} />
    </View>
  );
}

function ProfilesScreen({
  profiles,
  loading,
  error,
  onRetry,
  onOpenDetail,
  onCreate,
}: {
  profiles: ProfileListItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenDetail: (profile: ProfileListItem) => void;
  onCreate: () => void;
}) {
  const [filter, setFilter] = useState<ProfileFilter>("client");
  const [query, setQuery] = useState("");
  const visibleProfiles = filterProfiles(profiles, filter, query);

  return (
    <View style={styles.stack}>
      <TouchableOpacity style={styles.createProfileButton} activeOpacity={0.78} onPress={onCreate}>
        <Plus size={19} color="#FFF9F3" />
        <Text style={styles.createProfileButtonText}>新增档案</Text>
      </TouchableOpacity>
      <View style={styles.searchBar}>
        <Search size={18} color={colors.subtle} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索姓名、编号、状态"
          placeholderTextColor={colors.subtle}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.segmented}>
        {([
          { key: "client" as const, label: "来访者" },
          { key: "supervisor" as const, label: "督导师" },
          { key: "supervisee" as const, label: "受督者" },
        ]).map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.segmentButton, filter === item.key && styles.segmentActive]}
            activeOpacity={0.75}
            onPress={() => setFilter(item.key)}
          >
            <Text style={[styles.segmentText, filter === item.key && styles.segmentTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.cardStack}>
        {loading ? (
          <View style={styles.emptySearchCard}>
            <Clock3 size={20} color={colors.subtle} />
            <Text style={styles.emptySearchTitle}>正在加载档案</Text>
            <Text style={styles.emptySearchCopy}>数据来自本地 FastAPI 与 PostgreSQL。</Text>
          </View>
        ) : null}
        {!loading && error ? (
          <View style={styles.emptySearchCard}>
            <CircleAlert size={20} color={colors.danger} />
            <Text style={styles.emptySearchTitle}>档案加载失败</Text>
            <Text style={styles.emptySearchCopy}>{error}</Text>
            <GhostButton icon={RefreshCcw} label="重新加载" onPress={onRetry} />
          </View>
        ) : null}
        {visibleProfiles.map((item) => (
          <TouchableOpacity key={item.id} style={styles.profileCard} activeOpacity={0.78} onPress={() => onOpenDetail(item)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.name} · {displayProfileCode(item)}</Text>
              <Text style={styles.listMeta}>
                {item.count}{item.countDetail ? ` · ${item.countDetail}` : ""} · {nextSessionLabel(item.next)}
              </Text>
              <View style={styles.badgeRow}>
                <Badge label={item.status} tone="green" />
                <Badge label={`风险 ${item.risk}`} tone={item.risk === "轻度" ? "warm" : "blue"} />
              </View>
            </View>
            <LockKeyhole size={18} color={colors.subtle} />
          </TouchableOpacity>
        ))}
        {!loading && !error && visibleProfiles.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <Search size={20} color={colors.subtle} />
            <Text style={styles.emptySearchTitle}>没有找到匹配档案</Text>
            <Text style={styles.emptySearchCopy}>可调整关键词或切换身份，也可以直接新增档案。</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ProfileUnlockScreen({
  profile,
  passwordSet,
  grantMinutes,
  onSubmit,
}: {
  profile: ProfileListItem;
  passwordSet: boolean;
  grantMinutes: number;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        <LockKeyhole size={26} color={colors.clayDark} />
        <Text style={styles.posterTitle}>{profile.name} · {profile.type}档案</Text>
        <Text style={styles.posterCopy}>
          {passwordSet
            ? `请输入该类型档案的 6 位数字访问密码。验证通过后 ${grantMinutes} 分钟内，同类型档案无需重复输入。`
            : "首次进入该类型档案，请设置 6 位数字访问密码。密码只保存为后端安全哈希。"}
        </Text>
      </View>
      <View style={styles.inlineCreateCard}>
        <Text style={styles.formPreviewTitle}>
          {passwordSet ? "验证档案访问密码" : "设置档案访问密码"}
        </Text>
        <TextInput
          value={password}
          onChangeText={(value) => setPassword(normalizeAccessPinInput(value))}
          placeholder="6 位数字密码"
          placeholderTextColor={colors.subtle}
          style={styles.archiveTextInput}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[
            styles.inlineCreateConfirm,
            (!isCompleteAccessPin(password) || submitting) && styles.inlineCreateConfirmDisabled,
          ]}
          disabled={!isCompleteAccessPin(password) || submitting}
          onPress={async () => {
            setSubmitting(true);
            try {
              await onSubmit(password);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Text style={styles.inlineCreateConfirmText}>
            {submitting ? "正在验证..." : passwordSet ? "验证并进入" : "设置并进入"}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>访问范围</Text>
        <Text style={styles.privacyCopy}>授权只适用于当前账号和当前档案类型，到期或授权失效时需要重新验证；有效期可在安全设置中调整。</Text>
      </View>
    </View>
  );
}

function ProfileCreateScreen({
  profiles,
  onNotice,
  onCreate,
}: {
  profiles: ProfileListItem[];
  onNotice: (title: string, detail: string) => void;
  onCreate: (input: ProfileCreateInput) => void;
}) {
  const [kind, setKind] = useState<ArchiveKind>("client");
  const [name, setName] = useState("");
  const suggestedCode = useMemo(() => suggestedProfileCode(profiles, kind), [profiles, kind]);
  const [code, setCode] = useState(() => suggestedProfileCode(profiles, "client"));
  const [gender, setGender] = useState("unknown");
  const [initialCount, setInitialCount] = useState("0");
  const [scheduledAt, setScheduledAt] = useState("");
  const [frequency, setFrequency] = useState("未设置");
  const [customFrequency, setCustomFrequency] = useState("");
  const [complaint, setComplaint] = useState("");
  const [crisisLevel, setCrisisLevel] = useState("none");
  const [profileStatus, setProfileStatus] = useState("active");
  const [supervisionMode, setSupervisionMode] = useState("online");
  const [notes, setNotes] = useState("");
  const fieldCopy = {
    client: {
      name: "姓名",
      code: "来访者编号",
      count: "咨询次数",
      time: "下次咨询时间",
      timePlaceholder: "例如：2026-07-14 09:30",
      notePlaceholder: "补充来访背景、转介来源等",
    },
    supervisor: {
      name: "督导师",
      count: "督导次数",
      time: "下次督导时间",
      timePlaceholder: "例如：2026-07-14 09:30",
      notePlaceholder: "补充督导取向、合作约定等",
    },
    supervisee: {
      name: "受督者",
      count: "受督次数",
      time: "下次受督时间",
      timePlaceholder: "例如：2026-07-14 09:30",
      notePlaceholder: "补充受督者背景、关注方向等",
    },
  }[kind];
  const frequencyOptions = [
    { value: "未设置", label: "未设置" },
    { value: "每周", label: "每周" },
    { value: "双周", label: "双周" },
    { value: "每月", label: "每月" },
    { value: "自定义", label: "自定义" },
  ];
  const genderOptions = [
    { value: "unknown", label: "未填写" },
    { value: "female", label: "女" },
    { value: "male", label: "男" },
    { value: "other", label: "其他" },
  ];
  const crisisOptions = [
    { value: "none", label: "无" },
    { value: "mild", label: "轻度" },
    { value: "moderate", label: "中度" },
    { value: "high", label: "高" },
  ];
  const statusOptions = [
    { value: "active", label: "进行中" },
    { value: "paused", label: "暂停" },
  ];
  const supervisionModeOptions = [
    { value: "online", label: "线上" },
    { value: "offline", label: "线下" },
    { value: "hybrid", label: "混合" },
  ];
  const switchKind = (nextKind: ArchiveKind) => {
    setKind(nextKind);
    setName("");
    setCode(suggestedProfileCode(profiles, nextKind));
    setGender("unknown");
    setInitialCount("0");
    setScheduledAt("");
    setFrequency("未设置");
    setCustomFrequency("");
    setComplaint("");
    setCrisisLevel("none");
    setProfileStatus("active");
    setSupervisionMode("online");
    setNotes("");
  };
  const frequencyValue = frequency === "自定义" ? customFrequency.trim() : frequency;
  const submit = () => {
    if (!name.trim()) {
      onNotice(`请填写${fieldCopy.name}`, `${fieldCopy.name}是创建档案的必要信息。`);
      return;
    }
    const parsedCount = Number.parseInt(initialCount.trim() || "0", 10);
    if (!Number.isFinite(parsedCount) || parsedCount < 0) {
      onNotice("次数格式不正确", "次数需要填写 0 或正整数。");
      return;
    }
    onCreate({
      kind,
      name: name.trim(),
      code: kind === "client" ? code.trim() : "",
      status: kind === "client" ? profileStatus : "active",
      crisisLevel: kind === "client" ? crisisLevel : undefined,
      initialSessionCount: parsedCount,
      next: scheduledAt.trim(),
      frequency: frequencyValue || "未设置",
      metadata: kind === "client"
        ? {
            gender,
            first_visit_complaint: complaint.trim(),
          }
        : {
            supervision_mode: supervisionMode,
          },
      notes: notes.trim(),
    });
  };

  return (
    <View style={styles.stack}>
      <View style={styles.identityPicker}>
        <IdentityOption active={kind === "client"} title="新增来访者" detail="咨询记录与个案报告" onPress={() => switchKind("client")} />
        <IdentityOption active={kind === "supervisor"} title="新增督导师" detail="受督记录与反馈" onPress={() => switchKind("supervisor")} />
        <IdentityOption active={kind === "supervisee"} title="新增受督者" detail="督导记录与评价" onPress={() => switchKind("supervisee")} />
      </View>
      <View style={styles.formPreviewCard}>
        <Text style={styles.formPreviewTitle}>基础信息</Text>
        <Text style={styles.formFieldLabel}>{fieldCopy.name}（必填）</Text>
        <TextInput value={name} onChangeText={setName} placeholder="例如：陈雨" placeholderTextColor={colors.subtle} style={styles.profileFormInput} />
        {kind === "client" ? (
          <>
            <View style={styles.formFieldHeader}>
              <Text style={styles.formFieldLabel}>{fieldCopy.code}</Text>
              <TouchableOpacity activeOpacity={0.75} onPress={() => setCode(suggestedCode)}>
                <Text style={styles.inlineLink}>使用自动编号</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={code}
              onChangeText={(value) => setCode(normalizeProfileCodeInput(value))}
              placeholder={suggestedCode || "例如：C26-001"}
              placeholderTextColor={colors.subtle}
              style={styles.profileFormInput}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
            />
            <Text style={styles.formHint}>规则：类型字母 + 年份 + 序号，例如 C26-001。也可以手动填写 12 位以内编号。</Text>
            <Text style={styles.formFieldLabel}>来访者性别</Text>
            <ChoiceGroup options={genderOptions} value={gender} onChange={setGender} />
          </>
        ) : null}
        <Text style={styles.formFieldLabel}>{fieldCopy.count}</Text>
        <TextInput
          value={initialCount}
          onChangeText={(value) => setInitialCount(value.replace(/[^0-9]/g, "").slice(0, 3))}
          placeholder="0"
          placeholderTextColor={colors.subtle}
          style={styles.profileFormInput}
          keyboardType="number-pad"
        />
        <Text style={styles.formFieldLabel}>频率</Text>
        <ChoiceGroup options={frequencyOptions} value={frequency} onChange={setFrequency} />
        {frequency === "自定义" ? (
          <TextInput
            value={customFrequency}
            onChangeText={setCustomFrequency}
            placeholder="例如：每 10 天、按需"
            placeholderTextColor={colors.subtle}
            style={styles.profileFormInput}
          />
        ) : null}
        <Text style={styles.formFieldLabel}>{fieldCopy.time}</Text>
        <DateTimePickerField
          value={scheduledAt}
          onChange={setScheduledAt}
          placeholder={fieldCopy.timePlaceholder}
        />
        {kind === "client" ? (
          <>
            <Text style={styles.formFieldLabel}>首访时主诉</Text>
            <TextInput
              value={complaint}
              onChangeText={setComplaint}
              placeholder="例如：近期焦虑、睡眠受影响"
              placeholderTextColor={colors.subtle}
              style={[styles.profileFormInput, styles.profileFormArea]}
              multiline
            />
            <Text style={styles.formFieldLabel}>危机评估</Text>
            <ChoiceGroup options={crisisOptions} value={crisisLevel} onChange={setCrisisLevel} />
            <Text style={styles.formFieldLabel}>个案状态</Text>
            <ChoiceGroup options={statusOptions} value={profileStatus} onChange={setProfileStatus} />
          </>
        ) : (
          <>
            <Text style={styles.formFieldLabel}>督导形式</Text>
            <ChoiceGroup options={supervisionModeOptions} value={supervisionMode} onChange={setSupervisionMode} />
          </>
        )}
        <Text style={styles.formFieldLabel}>备注</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={fieldCopy.notePlaceholder}
          placeholderTextColor={colors.subtle}
          style={[styles.profileFormInput, styles.profileFormArea]}
          multiline
        />
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>基础档案长期保存</Text>
        <Text style={styles.privacyCopy}>基础档案信息会长期保存在云端；录音、咨询记录、个案报告、附件等敏感资料仍按 14 天临时保存与主动授权规则处理。</Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, styles.wideButton, !name.trim() && styles.pendingPrimaryButton]}
        activeOpacity={0.78}
        onPress={submit}
      >
        <FolderOpen size={18} color="#FFF9F3" />
        <Text style={styles.primaryButtonText}>{name.trim() ? "创建并进入档案" : `请先填写${fieldCopy.name}`}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ChoiceGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.choiceGroup}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[styles.choicePill, value === option.value && styles.choicePillActive]}
          activeOpacity={0.75}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.choicePillText, value === option.value && styles.choicePillTextActive]}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const FREQUENCY_CHOICES = [
  { value: "未设置", label: "未设置" },
  { value: "每周", label: "每周" },
  { value: "双周", label: "双周" },
  { value: "每月", label: "每月" },
  { value: "自定义", label: "自定义" },
];

const PROFILE_STATUS_CHOICES = [
  { value: "进行中", label: "进行中" },
  { value: "暂停", label: "暂停" },
  { value: "已结束", label: "已结束" },
];

// 后端 status 存的是英文枚举，界面用中文展示，提交前需要映射回去。
const PROFILE_STATUS_TO_BACKEND: Record<string, string> = {
  进行中: "active",
  暂停: "paused",
  已结束: "closed",
};

function ProfileDetailScreen({
  profile,
  sessions,
  legalAttachments,
  onUpdateNextSession,
  onUpdateFrequency,
  onUpdateDetails,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onUploadLegal,
  onOpenRecord,
  onOpenCaseReport,
  hasCaseReport,
  onOpenMaterial,
  onPreviewLegal,
  onOpenPrivacy,
  onNotice,
}: {
  profile: ArchiveResult;
  sessions: SessionHistoryItem[];
  legalAttachments: ProfileAttachment[];
  onUpdateNextSession: (nextSessionAt: string | null) => Promise<void>;
  onUpdateFrequency: (frequency: string) => Promise<void>;
  onUpdateDetails: (patch: {
    name?: string;
    code?: string | null;
    status?: string;
    frequency?: string;
    initialSessionCount?: number;
    notes?: string;
  }) => Promise<void>;
  onCreateSession: (input: { sessionType: string; occurredAt: string; summary: string }) => Promise<void>;
  onUpdateSession: (
    sessionId: string,
    patch: { occurredAt?: string; summary?: string; tags?: string[] },
  ) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onUploadLegal: (
    title: string,
    category: string,
    existing: ProfileAttachment | undefined,
  ) => Promise<void>;
  onOpenRecord: (sessionId: string) => void;
  onOpenCaseReport: () => void;
  hasCaseReport: boolean;
  onOpenMaterial: (category: MaterialCategory, sessionId: string) => void;
  onPreviewLegal: (attachment: ProfileAttachment) => void;
  onOpenPrivacy: () => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newSessionTime, setNewSessionTime] = useState(() => formatDateTimeInput(new Date()));
  const [editingNextSession, setEditingNextSession] = useState(false);
  const [editingFrequency, setEditingFrequency] = useState(false);
  const [frequencyDraft, setFrequencyDraft] = useState(profile.profileFrequency ?? "未设置");
  const [savingFrequency, setSavingFrequency] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.profileName);
  const [codeDraft, setCodeDraft] = useState(profile.profileCode ?? "");
  const [statusDraft, setStatusDraft] = useState(profile.profileStatus ?? "进行中");
  const [initialCountDraft, setInitialCountDraft] = useState(String(profile.initialSessionCount ?? 0));
  const [notesDraft, setNotesDraft] = useState(profile.profileNotes ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  useEffect(() => {
    setNameDraft(profile.profileName);
    setCodeDraft(profile.profileCode ?? "");
    setStatusDraft(profile.profileStatus ?? "进行中");
    setInitialCountDraft(String(profile.initialSessionCount ?? 0));
    setNotesDraft(profile.profileNotes ?? "");
    setFrequencyDraft(profile.profileFrequency ?? "未设置");
  }, [profile]);
  const [nextSessionDraft, setNextSessionDraft] = useState(() => (
    profile.profileNextSessionAt ? formatDateTimeInput(profile.profileNextSessionAt) : formatDateTimeInput(new Date())
  ));
  const [savingNextSession, setSavingNextSession] = useState(false);
  const [newSessionSummary, setNewSessionSummary] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);
  const [uploadingLegalCategory, setUploadingLegalCategory] = useState<string | null>(null);
  const hasRecords = profile.recordLabel !== "尚无记录";
  const nextStatLabel = profile.profileNext?.startsWith("已过期") ? "安排" : "下次";
  const sessionNoun = profile.kindLabel === "来访者" ? "咨询" : profile.kindLabel === "督导师" ? "受督" : "督导";
  const sessionBySequence = new Map(sessions.map((session) => [session.sequence, session]));
  const latestSequence = Math.max(
    profile.latestSequence ?? 0,
    ...sessions.map((session) => session.sequence),
  );
  const timelineEntries = latestSequence > 0
    ? Array.from({ length: latestSequence }, (_, index) => latestSequence - index).map((sequence) => ({
        sequence,
        session: sessionBySequence.get(sequence),
      }))
    : [];
  const legalFiles = profile.kindLabel === "来访者"
    ? [
        { title: "知情同意书", category: "consent" },
        { title: "咨询协议", category: "counseling_agreement" },
      ]
    : profile.kindLabel === "督导师"
      ? [
          { title: "督导协议", category: "supervision_agreement" },
          { title: "督导评价", category: "supervision_evaluation" },
        ]
      : [
          { title: "督导协议", category: "supervision_agreement" },
          { title: "受督者评估", category: "supervisee_assessment" },
        ];
  const legalEntries = legalFiles.map((item) => ({
    ...item,
    attachment: legalAttachments.find((attachment) => attachment.category === item.category),
  }));
  return (
    <View style={styles.stack}>
      <View style={styles.profileHeaderCard}>
        <View style={styles.detailHeroTop}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{profile.profileName.slice(0, 1)}</Text>
          </View>
          <View style={styles.listBody}>
            <Text style={styles.detailName}>{profile.profileName}</Text>
            <Text style={styles.listMeta}>{profile.kindLabel}档案 · {profile.recordLabel}</Text>
            {profile.countDetail ? <Text style={styles.listMeta}>{profile.countDetail}</Text> : null}
          </View>
          <Badge label="已解锁" tone="green" />
        </View>
        <View style={styles.detailStats}>
          <MiniStat label="状态" value={profile.profileStatus ?? (hasRecords ? "处理中" : "新建")} />
          <MiniStat
            label="频率"
            value={profile.profileFrequency ?? "未设置"}
            onPress={() => {
              setFrequencyDraft(profile.profileFrequency ?? "未设置");
              setEditingProfile(false);
              setEditingFrequency((current) => !current);
            }}
          />
        </View>
        <NextSessionStat
          label={nextStatLabel}
          next={profile.profileNext ?? "未设置"}
          nextAt={profile.profileNextSessionAt}
          onPress={() => setEditingNextSession((current) => !current)}
        />
        <TouchableOpacity
          style={styles.smallActionButton}
          activeOpacity={0.78}
          onPress={() => {
            setEditingFrequency(false);
            setEditingProfile((current) => !current);
          }}
        >
          <Edit3 size={15} color={colors.clayDark} />
          <Text style={styles.smallActionText}>{editingProfile ? "收起基本信息" : "编辑基本信息"}</Text>
        </TouchableOpacity>
      </View>

      {editingProfile ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>编辑基本信息</Text>
          <Text style={styles.formFieldLabel}>姓名 / 称呼</Text>
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder="例如：陈雨"
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
          />
          <Text style={styles.formFieldLabel}>档案编号</Text>
          <TextInput
            value={codeDraft}
            onChangeText={setCodeDraft}
            placeholder="留空则由系统生成"
            placeholderTextColor={colors.subtle}
            autoCapitalize="characters"
            style={styles.archiveTextInput}
          />
          <Text style={styles.formFieldLabel}>档案状态</Text>
          <ChoiceGroup options={PROFILE_STATUS_CHOICES} value={statusDraft} onChange={setStatusDraft} />
          <Text style={styles.formFieldLabel}>咨询频率</Text>
          <ChoiceGroup options={FREQUENCY_CHOICES} value={frequencyDraft} onChange={setFrequencyDraft} />
          <Text style={styles.formFieldLabel}>既往咨询次数</Text>
          <TextInput
            value={initialCountDraft}
            onChangeText={(value) => setInitialCountDraft(value.replace(/[^0-9]/g, ""))}
            placeholder="0"
            placeholderTextColor={colors.subtle}
            keyboardType="numeric"
            style={styles.archiveTextInput}
          />
          <Text style={styles.formFieldLabel}>备注</Text>
          <TextInput
            value={notesDraft}
            onChangeText={setNotesDraft}
            placeholder="仅自己可见的背景说明"
            placeholderTextColor={colors.subtle}
            style={[styles.archiveTextInput, styles.archiveTextArea]}
            multiline
          />
          <View style={styles.inlineActions}>
            <GhostButton icon={X} label="取消" onPress={() => setEditingProfile(false)} />
            <PrimaryButton
              icon={Save}
              label={savingProfile ? "保存中..." : "保存基本信息"}
              onPress={async () => {
                if (savingProfile) return;
                if (!nameDraft.trim()) {
                  onNotice("请填写姓名", "档案至少需要姓名或称呼。");
                  return;
                }
                setSavingProfile(true);
                try {
                  await onUpdateDetails({
                    name: nameDraft.trim(),
                    code: codeDraft.trim() || null,
                    status: PROFILE_STATUS_TO_BACKEND[statusDraft] ?? statusDraft,
                    frequency: frequencyDraft,
                    initialSessionCount: Number(initialCountDraft) || 0,
                    notes: notesDraft.trim(),
                  });
                  setEditingProfile(false);
                } catch {
                  // 父级已提示具体错误
                } finally {
                  setSavingProfile(false);
                }
              }}
              disabled={savingProfile}
            />
          </View>
        </View>
      ) : null}

      {editingNextSession ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>设置下次{sessionNoun}时间</Text>
          <DateTimePickerField value={nextSessionDraft} onChange={setNextSessionDraft} placeholder="设置下次咨询时间" defaultOpen />
          <View style={styles.inlineActions}>
            <GhostButton icon={X} label="清空下次" onPress={async () => {
              if (savingNextSession) return;
              setSavingNextSession(true);
              try {
                await onUpdateNextSession(null);
                setEditingNextSession(false);
              } finally {
                setSavingNextSession(false);
              }
            }} />
            <PrimaryButton icon={Save} label={savingNextSession ? "保存中..." : "保存下次"} onPress={async () => {
              if (savingNextSession) return;
              const normalized = normalizeSessionDate(nextSessionDraft);
              if (!normalized || Number.isNaN(Date.parse(normalized))) {
                onNotice("日期时间格式不正确", "请重新选择下次时间。");
                return;
              }
              setSavingNextSession(true);
              try {
                await onUpdateNextSession(normalized);
                setEditingNextSession(false);
              } finally {
                setSavingNextSession(false);
              }
            }} disabled={savingNextSession} />
          </View>
        </View>
      ) : null}

      {editingFrequency ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>设置咨询频率</Text>
          <ChoiceGroup
            options={FREQUENCY_CHOICES}
            value={frequencyDraft}
            onChange={setFrequencyDraft}
          />
          <View style={styles.inlineActions}>
            <GhostButton icon={X} label="取消" onPress={() => setEditingFrequency(false)} />
            <PrimaryButton
              icon={Save}
              label={savingFrequency ? "保存中..." : "保存频率"}
              onPress={async () => {
                if (savingFrequency) return;
                setSavingFrequency(true);
                try {
                  await onUpdateFrequency(frequencyDraft);
                  setEditingFrequency(false);
                } catch {
                  // 父级已提示具体错误
                } finally {
                  setSavingFrequency(false);
                }
              }}
              disabled={savingFrequency}
            />
          </View>
        </View>
      ) : null}

      <SectionHeader title="法律及伦理文件" />
      <View style={styles.legalGrid}>
        <LegalFile
          title={legalEntries[0].title}
          meta={uploadingLegalCategory === legalEntries[0].category ? "正在上传..." : legalEntries[0].attachment?.meta ?? "待上传"}
          icon={FileText}
          onPress={async () => {
            if (uploadingLegalCategory) return;
            if (!legalEntries[0].attachment) {
              setUploadingLegalCategory(legalEntries[0].category);
              try {
                await onUploadLegal(legalEntries[0].title, legalEntries[0].category, legalEntries[0].attachment);
              } catch {
                // Parent already showed the specific upload failure.
              } finally {
                setUploadingLegalCategory(null);
              }
              return;
            }
            onPreviewLegal(legalEntries[0].attachment);
          }}
        />
        <LegalFile
          title={legalEntries[1].title}
          meta={uploadingLegalCategory === legalEntries[1].category ? "正在上传..." : legalEntries[1].attachment?.meta ?? "待上传"}
          icon={ClipboardList}
          onPress={async () => {
            if (uploadingLegalCategory) return;
            if (!legalEntries[1].attachment) {
              setUploadingLegalCategory(legalEntries[1].category);
              try {
                await onUploadLegal(legalEntries[1].title, legalEntries[1].category, legalEntries[1].attachment);
              } catch {
                // Parent already showed the specific upload failure.
              } finally {
                setUploadingLegalCategory(null);
              }
              return;
            }
            onPreviewLegal(legalEntries[1].attachment);
          }}
        />
      </View>

      <SectionHeader title={`${sessionNoun}历程`} action={showCreateSession ? "收起" : "新增历程"} onAction={() => setShowCreateSession((current) => !current)} />
      {showCreateSession ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>新增{sessionNoun}记录</Text>
          <DateTimePickerField
            value={newSessionTime}
            onChange={setNewSessionTime}
            placeholder={`选择${sessionNoun}时间`}
            defaultOpen
          />
          <TextInput
            value={newSessionSummary}
            onChangeText={setNewSessionSummary}
            placeholder="本次摘要，可创建后继续修改"
            placeholderTextColor={colors.subtle}
            style={[styles.archiveTextInput, styles.archiveTextArea]}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.inlineCreateConfirm,
              creatingSession && styles.inlineCreateConfirmDisabled,
            ]}
            activeOpacity={0.78}
            disabled={creatingSession}
            onPress={async () => {
            const occurredAt = normalizeSessionDate(newSessionTime);
            if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
              onNotice("日期时间格式不正确", "请重新选择记录时间。");
              return;
            }
            setCreatingSession(true);
            try {
              await onCreateSession({
                sessionType: profile.kindLabel === "来访者" ? "counseling" : "supervision",
                occurredAt,
                summary: newSessionSummary.trim() || `尚未补充本次${sessionNoun}摘要。`,
              });
              setShowCreateSession(false);
              setNewSessionSummary("");
            } catch {
              // Parent already showed the specific creation failure.
            } finally {
              setCreatingSession(false);
            }
          }}>
            <Text style={styles.inlineCreateConfirmText}>
              {creatingSession ? "正在创建..." : "创建记录"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {timelineEntries.length > 0 ? timelineEntries.map((entry) => entry.session ? (
          <SessionCard
            key={entry.session.id}
            session={entry.session}
            sessionNoun={sessionNoun}
            recordType={getRecordType(profile.kindLabel)}
            onChange={(patch) => onUpdateSession(entry.session!.id, {
              occurredAt: patch.occurredAt,
              summary: patch.summary,
              tags: patch.tags,
            })}
            onDelete={() => onDeleteSession(entry.session!.id)}
            onOpenRecord={() => onOpenRecord(entry.session!.id)}
            onOpenMaterial={(category) => onOpenMaterial(category, entry.session!.id)}
            onNotice={onNotice}
          />
        ) : (
          <MissingSessionCard
            key={`missing-${entry.sequence}`}
            sequence={entry.sequence}
            sessionNoun={sessionNoun}
          />
        )) : (
        <View style={styles.emptyProfileState}>
          <View style={styles.emptyProfileIcon}>
            <ClipboardList size={22} color={colors.clayDark} />
          </View>
          <Text style={styles.emptyProfileTitle}>尚无{sessionNoun}记录</Text>
          <Text style={styles.emptyProfileCopy}>创建首次记录后，可添加录音、量表、作业和其他资料。</Text>
        </View>
      )}

      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>保存规则会跟随每次记录</Text>
        <Text style={styles.privacyCopy}>录音只能临时保存 14 天；记录、量表、作业和其他附件可在对应卡片内主动授权长期保存。草稿保存为正式版后，正式版不可直接编辑。</Text>
      </View>

      <GhostButton icon={ShieldCheck} label="管理本档案的隐私与授权" onPress={onOpenPrivacy} />

      {profile.kindLabel === "来访者" && sessions.length > 0 ? (
        <PrimaryButton
          icon={Sparkles}
          label={hasCaseReport ? "查看个案报告" : "生成个案报告"}
          onPress={onOpenCaseReport}
          wide
        />
      ) : null}
    </View>
  );
}

function RecordingDetailScreen({
  recording,
  summary,
  chapters,
  turns,
  hasManualEdits,
  onOpenRecord,
  onOpenChapters,
  onOpenTranscript,
  onRegenerated,
  onNotice,
  onOpenPrivacy,
}: {
  recording: RecordingItem;
  summary: string;
  chapters: EditableChapter[];
  turns: EditableTranscriptTurn[];
  hasManualEdits: boolean;
  onOpenRecord: () => void;
  onOpenChapters: () => void;
  onOpenTranscript: () => void;
  onRegenerated: () => Promise<void>;
  onNotice: (title: string, detail: string) => void;
  onOpenPrivacy: () => void;
}) {
  const speakers = uniqueTranscriptSpeakers(turns);
  const [confirmRegeneration, setConfirmRegeneration] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const regenerationWarning = decideRecordingRegeneration(true, false).message;
  return (
    <View style={styles.stack}>
      <View style={styles.noticeCard}>
        <CheckCircle2 size={23} color={colors.sageDark} />
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>{recording.title}</Text>
          <Text style={styles.listMeta}>{recording.duration} · {recording.archive} · {recording.ttl}</Text>
        </View>
      </View>
      <RecordingAudioPlayer
        fileId={recording.audioFileId ?? null}
        available={recordingAudioCanProcess(recording.ttl)}
        title={recording.title}
        fallbackDuration={recording.duration}
        onNotice={onNotice}
      />

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>录音纪要</Text>
          <GhostButton
            icon={RefreshCcw}
            label={regenerating ? "正在生成..." : confirmRegeneration ? "确认覆盖" : "重新生成"}
            onPress={() => {
              if (regenerating) return;
              const decision = decideRecordingRegeneration(hasManualEdits, confirmRegeneration);
              if (decision.status === "confirm") {
                setConfirmRegeneration(true);
                return;
              }
              setConfirmRegeneration(false);
              setRegenerating(true);
              void onRegenerated().catch(() => {
                setConfirmRegeneration(true);
              }).finally(() => setRegenerating(false));
            }}
          />
        </View>
        <Text style={styles.summaryCopy}>{summary}</Text>
        {confirmRegeneration ? (
          <View style={styles.warningPanel}>
            <CircleAlert size={18} color={colors.danger} />
            <Text style={styles.warningText}>{regenerationWarning}</Text>
          </View>
        ) : null}
      </View>

      <SectionHeader title="章节速览" action="编辑" onAction={onOpenChapters} />
      <View style={styles.cardStack}>
        {chapters.map((item) => (
          <ChapterRow key={item.time} time={item.time} title={item.title} current={item.current} />
        ))}
      </View>

      <SectionHeader title="转写片段" action="完整文本" onAction={onOpenTranscript} />
      <View style={styles.transcriptTools}>
        <View style={styles.transcriptToolHeader}>
          <Text style={styles.transcriptToolTitle}>转写校对</Text>
          <Badge label="3 处待确认" tone="warm" />
        </View>
        <View style={styles.speakerRow}>
          {speakers.map((speaker) => (
            <Text key={speaker.key} style={styles.speakerChip}>{speaker.label}</Text>
          ))}
        </View>
        <Text style={styles.transcriptToolCopy}>可编辑发言人名称、逐段校对文本。修改后会同步影响纪要和本次记录草稿。</Text>
      </View>
      <View style={styles.transcriptCard}>
        {turns.map((item) => (
          <View key={item.time} style={styles.transcriptTurn}>
            <Text style={styles.transcriptSpeaker}>{item.speaker} · {item.time}</Text>
            <Text style={styles.transcriptText}>{item.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.exportPanel}>
        <DataRow icon={Download} title="下载录音纪要 PDF" value={exportReady ? "已下载 · 可重新下载" : "包含纪要、章节与完整转写"} onPress={async () => {
          setExportReady(true);
          try {
            const uri = await downloadSummaryPdf(buildDownloadArtifact({
              title: `${recording.title} 录音纪要`,
              fileType: "PDF",
              sections: [
                { title: "录音纪要", content: summary },
                { title: "章节速览", content: chapters.map((chapter) => `${chapter.time} ${chapter.title}`).join("\n") },
                { title: "完整转写", content: turns.map((turn) => `${turn.time} ${turn.speaker}\n${turn.text}`).join("\n\n") },
              ],
            }));
            onNotice("下载已开始", `PDF 已生成，保存到本机“下载”目录并弹出分享（路径：${uri}）。`);
          } catch (error) {
            onNotice("下载失败", error instanceof Error ? error.message : "请稍后重试。");
          }
        }} />
        <DataRow icon={ShieldCheck} title="长期保存授权" value="转写与纪要可授权，原始录音不可授权" onPress={onOpenPrivacy} />
      </View>
    </View>
  );
}

function ChapterEditorScreen({
  chapters,
  onChange,
  onSave,
}: {
  chapters: EditableChapter[];
  onChange: (index: number, chapter: EditableChapter) => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <View style={styles.stack}>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>章节会同步到录音纪要</Text>
        <Text style={styles.privacyCopy}>可校正时间点和标题。保存后，本次记录生成将使用最新章节结构。</Text>
      </View>
      {chapters.map((chapter, index) => (
        <View key={`${chapter.time}-${index}`} style={styles.editSection}>
          <Text style={styles.editSectionTitle}>章节 {index + 1}</Text>
          <View style={styles.twoColumnInputs}>
            <TextInput
              value={chapter.time}
              onChangeText={(time) => onChange(index, { ...chapter, time })}
              placeholder="时间点"
              placeholderTextColor={colors.subtle}
              style={[styles.profileFormInput, styles.compactInput]}
            />
            <TextInput
              value={chapter.title}
              onChangeText={(title) => onChange(index, { ...chapter, title })}
              placeholder="章节标题"
              placeholderTextColor={colors.subtle}
              style={[styles.profileFormInput, styles.flexInput]}
            />
          </View>
        </View>
      ))}
      <PrimaryButton icon={Save} label={saving ? "正在保存..." : "保存章节修改"} onPress={() => {
        if (saving) return;
        setSaving(true);
        void onSave().catch(() => {
          // Parent already showed the specific save failure.
        }).finally(() => setSaving(false));
      }} wide disabled={saving} />
    </View>
  );
}

function TranscriptEditorScreen({
  turns,
  onRenameSpeaker,
  onChange,
  onSave,
}: {
  turns: EditableTranscriptTurn[];
  onRenameSpeaker: (speakerKey: string, speaker: string) => void;
  onChange: (index: number, turn: EditableTranscriptTurn) => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const speakers = uniqueTranscriptSpeakers(turns);
  return (
    <View style={styles.stack}>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>校对发言人与文本</Text>
        <Text style={styles.privacyCopy}>修改某个发言人名称后，保存时会同步到该发言人的全部片段。</Text>
      </View>
      <View style={styles.editSection}>
        <Text style={styles.editSectionTitle}>发言人</Text>
        {speakers.map((speaker) => (
          <View key={speaker.key} style={styles.twoColumnInputs}>
            <Text style={styles.speakerKeyLabel}>{speaker.key.replace("speaker_", "发言人 ")}</Text>
            <TextInput
              value={speaker.label}
              onChangeText={(label) => onRenameSpeaker(speaker.key, label)}
              style={[styles.profileFormInput, styles.flexInput]}
            />
          </View>
        ))}
      </View>
      {turns.map((turn, index) => (
        <View key={`${turn.time}-${index}`} style={styles.editSection}>
          <View style={styles.twoColumnInputs}>
            <TextInput
              value={turn.time}
              onChangeText={(time) => onChange(index, { ...turn, time })}
              style={[styles.profileFormInput, styles.compactInput]}
            />
            <Text style={styles.transcriptSpeakerLabel}>{turn.speaker}</Text>
          </View>
          <TextInput
            value={turn.text}
            onChangeText={(text) => onChange(index, { ...turn, text })}
            multiline
            style={[styles.profileFormInput, styles.profileFormArea]}
          />
        </View>
      ))}
      <PrimaryButton icon={Save} label={saving ? "正在保存..." : "保存完整转写"} onPress={() => {
        if (saving) return;
        setSaving(true);
        void onSave().catch(() => {
          // Parent already showed the specific save failure.
        }).finally(() => setSaving(false));
      }} wide disabled={saving} />
    </View>
  );
}

function uniqueTranscriptSpeakers(turns: EditableTranscriptTurn[]) {
  const speakers = new Map<string, string>();
  turns.forEach((turn) => {
    if (turn.speakerKey) speakers.set(turn.speakerKey, turn.speaker);
  });
  return [...speakers].map(([key, label]) => ({ key, label }));
}

function SessionMaterialsScreen({
  category,
  materials,
  onOpenRecording,
  onPreview,
  onAdd,
  onAuthorize,
  onSelectUnarchived,
  onStartRecording,
}: {
  category: MaterialCategory;
  materials: SessionMaterial[];
  onOpenRecording: () => void;
  onPreview: (material: SessionMaterial) => void;
  onAdd: (fileType: string) => Promise<void>;
  onAuthorize: () => void;
  onSelectUnarchived: (recordingId: string) => Promise<void>;
  onStartRecording: () => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [fileType, setFileType] = useState(category === "recording" ? "音频" : category === "homework" || category === "other" ? "PDF" : "图片");
  const copy = materialCategoryCopy[category];
  const isRecording = category === "recording";
  const [unarchived, setUnarchived] = useState<Array<{ id: string; title: string; meta: string }>>([]);
  const [loadingUnarchived, setLoadingUnarchived] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const loadUnarchived = useCallback(async () => {
    if (!isRecording) return;
    setLoadingUnarchived(true);
    try {
      const response = await recordingService.list({ archiveStatus: "unarchived", pageSize: 50 });
      setUnarchived(
        response.items
          .filter((item) => Boolean(item.audioFileId))
          .map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.sourceType === "uploaded_audio" ? "上传音频" : "应用内录音"} · ${formatDuration(item.durationSeconds ?? 0)}`,
          })),
      );
    } catch {
      // 列表读取失败时不阻塞页面，用户仍可通过下方入口上传。
    } finally {
      setLoadingUnarchived(false);
    }
  }, [isRecording]);

  useEffect(() => {
    void loadUnarchived();
  }, [loadUnarchived]);

  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        {category === "recording" ? <Mic size={25} color={colors.clayDark} /> : <Upload size={25} color={colors.clayDark} />}
        <Text style={styles.posterTitle}>{copy.title}</Text>
        <Text style={styles.posterCopy}>{category === "recording" ? "原始录音仅临时保存 14 天；转写与纪要可单独授权。" : "新增资料会参与下一次生成本次记录，但不会自动覆盖已有草稿或正式版。"}</Text>
      </View>

      {isRecording ? (
        <View style={styles.cardStack}>
          <Text style={styles.formFieldLabel}>选择未归档录音归入本次记录</Text>
          {loadingUnarchived ? <Text style={styles.listMeta}>正在读取未归档录音...</Text> : null}
          {!loadingUnarchived && unarchived.length === 0 ? (
            <View style={styles.emptySearchCard}>
              <Mic size={20} color={colors.subtle} />
              <Text style={styles.emptySearchTitle}>没有未归档录音</Text>
              <Text style={styles.emptySearchCopy}>可以直接开始录音，或从本地上传音频文件。</Text>
            </View>
          ) : null}
          {unarchived.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.recordingCard}
              activeOpacity={0.78}
              disabled={selectingId !== null}
              onPress={async () => {
                if (selectingId) return;
                setSelectingId(item.id);
                try {
                  await onSelectUnarchived(item.id);
                  await loadUnarchived();
                } catch {
                  // 父级已提示具体失败原因。
                } finally {
                  setSelectingId(null);
                }
              }}
            >
              <View style={styles.recordingIcon}>
                <Mic size={20} color={colors.clayDark} />
              </View>
              <View style={styles.listBody}>
                <Text style={styles.listTitle}>{truncateMiddle(item.title)}</Text>
                <Text style={styles.listMeta}>{item.meta}</Text>
              </View>
              {selectingId === item.id ? <Clock3 size={18} color={colors.clayDark} /> : <ChevronRight size={18} color={colors.subtle} />}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <SectionHeader title={`当前资料 · ${materials.length} 项`} action={showUpload ? "收起" : isRecording ? "上传本地音频" : copy.uploadLabel} onAction={() => setShowUpload((current) => !current)} />
      {showUpload ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formHelp}>点击后将打开系统文件选择器，文件名和类型以真实文件为准。</Text>
          <View style={styles.segmented}>
            {(category === "recording" ? ["音频"] : ["PDF", "图片"]).map((type) => (
              <TouchableOpacity key={type} style={[styles.segmentButton, fileType === type && styles.segmentActive]} onPress={() => setFileType(type)}>
                <Text style={[styles.segmentText, fileType === type && styles.segmentTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.inlineCreateConfirm} activeOpacity={0.78} onPress={async () => {
            await onAdd(fileType);
            setShowUpload(false);
          }}>
            <Text style={styles.inlineCreateConfirmText}>选择并上传文件</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {materials.length > 0 ? (
        <View style={styles.cardStack}>
          {materials.map((material) => (
            <TouchableOpacity
              key={material.id}
              style={styles.recordingCard}
              activeOpacity={0.78}
              onPress={material.category === "recording" ? onOpenRecording : () => onPreview(material)}
            >
              <View style={styles.recordingIcon}>
                {material.category === "recording" ? <Mic size={20} color={colors.clayDark} /> : <FileText size={20} color={colors.clayDark} />}
              </View>
              <View style={styles.listBody}>
                <Text style={styles.listTitle}>{truncateMiddle(material.title)}</Text>
                <Text style={styles.listMeta}>{material.meta}</Text>
                <View style={styles.badgeRow}>
                  <Badge label={material.preservable ? "可授权长期保存" : "不可长期保存"} tone={material.preservable ? "green" : "warm"} />
                </View>
              </View>
              <ChevronRight size={18} color={colors.subtle} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptySearchCard}>
          <Upload size={20} color={colors.subtle} />
          <Text style={styles.emptySearchTitle}>暂无资料</Text>
          <Text style={styles.emptySearchCopy}>{copy.empty}</Text>
        </View>
      )}

      {category !== "recording" && materials.length > 0 ? <GhostButton icon={ShieldCheck} label="选择资料长期保存" onPress={onAuthorize} /> : null}
      {category === "recording" ? <GhostButton icon={Mic} label="开始新录音" onPress={onStartRecording} /> : null}
    </View>
  );
}

function truncateMiddle(name: string, max = 22): string {
  const text = name.trim();
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

function FilePreviewScreen({
  file,
  onNotice,
  onUpdate,
  onDelete,
}: {
  file: PreviewFile;
  onNotice: (title: string, detail: string) => void;
  onUpdate: (title: string, fileType: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(file.title);
  const [fileType, setFileType] = useState(file.fileType);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replacingFile, setReplacingFile] = useState(false);
  const [deletingFile, setDeletingFile] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const downloadState = getOriginalFileDownloadState(file.file);
  const deleteWarning = file.source === "legal"
    ? "删除后会从当前档案的法律及伦理文件中移除，已有引用只保留“文件已删除”状态。"
    : "删除后会从本次咨询材料中移除，已有引用只保留“文件已删除”状态。";

  useEffect(() => {
    if (!file.file?.fileId) {
      setPreviewUrl(null);
      setPreviewError("文件尚未完成上传，暂不能预览。");
      return;
    }
    let active = true;
    setPreviewLoading(true);
    setPreviewError(null);
    void fileService.getDownloadUrl(file.file.fileId)
      .then((result) => {
        if (active) setPreviewUrl(result.download_url);
      })
      .catch((error) => {
        if (!active) return;
        setPreviewUrl(null);
        setPreviewError(error instanceof Error ? error.message : "文件预览地址获取失败。");
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [file.file?.fileId]);

  return (
    <View style={styles.stack}>
      <View style={styles.filePreviewCanvas}>
        <View style={styles.filePreviewIcon}>
          {fileType === "图片" ? <Eye size={30} color={colors.clayDark} /> : <FileText size={30} color={colors.clayDark} />}
        </View>
        <Text style={styles.filePreviewTitle}>{truncateMiddle(file.title)}</Text>
        <Text style={styles.filePreviewMeta}>{file.meta}</Text>
        {file.file?.filename && file.file.filename !== file.title ? (
          <Text style={styles.filePreviewOriginal}>原名：{file.file.filename}</Text>
        ) : null}
        <View style={styles.filePreviewFrame}>
          {previewLoading ? (
            <ActivityIndicator color={colors.clayDark} />
          ) : previewUrl && fileType === "图片" ? (
            Platform.OS === "web" ? createElement("img", {
              src: previewUrl,
              alt: file.title,
              style: {
                width: "100%",
                height: "100%",
                objectFit: "contain",
                borderRadius: 14,
              },
            }) : (
              <Image
                source={{ uri: previewUrl }}
                style={{ width: "100%", height: "100%", borderRadius: 14 }}
                resizeMode="contain"
                accessibilityLabel={file.title}
              />
            )
          ) : previewUrl && Platform.OS === "web" && fileType === "音频" ? (
            createElement("audio", {
              controls: true,
              preload: "metadata",
              src: previewUrl,
              style: { width: "100%" },
            })
          ) : previewUrl && Platform.OS === "web" ? (
            createElement("iframe", {
              title: file.title,
              src: previewUrl,
              style: {
                width: "100%",
                height: "100%",
                border: 0,
                borderRadius: 14,
                background: "#fff",
              },
            })
          ) : previewUrl && fileType === "PDF" ? (
            <TouchableOpacity style={styles.filePreviewOpenButton} activeOpacity={0.78} onPress={() => { void Linking.openURL(previewUrl); }}>
              <FileText size={18} color={colors.clayDark} />
              <Text style={styles.filePreviewOpenText}>用其他应用打开 PDF</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.filePreviewPlaceholder}>
              {previewError ?? (previewUrl ? "当前端暂不支持内嵌预览，可下载原文件查看。" : "暂不能预览此文件。")}
            </Text>
          )}
        </View>
      </View>

      {editing ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>修改文件</Text>
          <TextInput value={title} onChangeText={setTitle} style={styles.archiveTextInput} />
          <View style={styles.segmented}>
            {["PDF", "图片"].map((type) => (
              <TouchableOpacity key={type} style={[styles.segmentButton, fileType === type && styles.segmentActive]} onPress={() => setFileType(type)}>
                <Text style={[styles.segmentText, fileType === type && styles.segmentTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PrimaryButton icon={Save} label={replacingFile ? "正在替换..." : "选择并替换文件"} onPress={async () => {
            if (!title.trim() || replacingFile) return;
            setReplacingFile(true);
            try {
              await onUpdate(title.trim(), fileType);
              setEditing(false);
            } catch {
              // Parent already showed the specific replacement failure.
            } finally {
              setReplacingFile(false);
            }
          }} wide disabled={replacingFile} />
        </View>
      ) : null}

      <View style={styles.fileActionStack}>
        <GhostButton icon={Download} label={downloadingFile ? "正在下载..." : downloadState.label} onPress={async () => {
          if (downloadingFile || deletingFile || replacingFile) return;
          if (!file.file?.fileId) {
            onNotice("暂不能下载原文件", "该文件尚未完成上传，请重新选择文件。");
            return;
          }
          setDownloadingFile(true);
          try {
            const result = await fileService.getDownloadUrl(file.file.fileId);
            await downloadAndShareFile(
              result.download_url,
              file.file.filename,
              file.file.mimeType,
            );
            onNotice(
              "文件已下载",
              Platform.OS === "web"
                ? "浏览器已开始下载文件；如果被拦截，请允许此站点下载。"
                : "文件已保存到应用目录，并已打开系统分享面板。",
            );
          } catch (error) {
            onNotice(
              "暂不能下载原文件",
              error instanceof ApiError ? error.message : "文件下载地址获取失败。",
            );
          } finally {
            setDownloadingFile(false);
          }
        }} />
        <GhostButton icon={Edit3} label={editing ? "取消修改" : "修改 / 替换"} onPress={() => {
          if (replacingFile || deletingFile) return;
          setEditing((current) => !current);
          setConfirmDelete(false);
        }} />
        <TouchableOpacity
          style={[
            styles.dangerButton,
            styles.flexActionButton,
            deletingFile && styles.dangerButtonDisabled,
          ]}
          activeOpacity={0.78}
          disabled={deletingFile}
          onPress={() => {
          if (!confirmDelete) {
            setConfirmDelete(true);
            return;
          }
          setDeletingFile(true);
          void onDelete().catch(() => {
            setDeletingFile(false);
          });
        }}>
          <Trash2 size={16} color={colors.danger} />
          <Text style={styles.dangerButtonText}>
            {deletingFile ? "正在删除..." : confirmDelete ? "确认删除文件" : "删除文件"}
          </Text>
        </TouchableOpacity>
      </View>
      {confirmDelete ? (
        <View style={styles.warningPanel}>
          <CircleAlert size={18} color={colors.danger} />
          <Text style={styles.warningText}>{deleteWarning}</Text>
        </View>
      ) : null}
    </View>
  );
}

function RecordEditorScreen({
  profile,
  recordLabel,
  sections,
  formal,
  dirty,
  onSectionsChange,
  onFormalChange,
  onDirtyChange,
  onSaveFormal,
  onCopyFormalToDraft,
  onRegenerateDraft,
  onDownload,
  onOpenPrivacy,
  onNotice,
}: {
  profile: ArchiveResult;
  recordLabel: string;
  sections: EditableRecordSection[];
  formal: boolean;
  dirty: boolean;
  onSectionsChange: (sections: EditableRecordSection[]) => void;
  onFormalChange: (formal: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaveFormal: () => Promise<void>;
  onCopyFormalToDraft: () => Promise<void>;
  onRegenerateDraft: () => Promise<void>;
  onDownload: () => Promise<void>;
  onOpenPrivacy: () => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const recordType = getRecordType(profile.kindLabel);
  const [pendingAction, setPendingAction] = useState<"copy" | "save" | "regenerate" | null>(null);
  return (
    <View style={styles.stack}>
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.editorEyebrow}>{recordType}{formal ? "正式版" : "草稿"}</Text>
          <Text style={styles.editorTitle}>{profile.profileName} · {recordLabel}</Text>
        </View>
        <View style={styles.editorHeaderActions}>
          <Badge label={formal ? "正式版" : "草稿"} tone={formal ? "green" : "warm"} />
        </View>
      </View>
      <View style={styles.ruleCard}>
        <CircleAlert size={19} color={colors.clayDark} />
        <Text style={styles.ruleText}>正式版不能直接编辑。保存正式版前，请确认草稿内容；后续修改会先复制为草稿再替换正式版。</Text>
      </View>

      <View style={styles.editorToolbar}>
        <View style={styles.editorSeg}>
          <TouchableOpacity style={[styles.editorSegItem, !formal && styles.editorSegItemActive]} activeOpacity={0.78} onPress={() => onFormalChange(false)}>
            <Text style={[styles.editorSegText, !formal && styles.editorSegTextActive]}>草稿</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.editorSegItem, formal && styles.editorSegItemActive]} activeOpacity={0.78} onPress={() => onFormalChange(true)}>
            <Text style={[styles.editorSegText, formal && styles.editorSegTextActive]}>正式版</Text>
          </TouchableOpacity>
        </View>
        {!formal ? (
          <GhostButton icon={RefreshCcw} label={pendingAction === "regenerate" ? "正在准备..." : "重新生成草稿"} onPress={() => {
            if (pendingAction) return;
            setPendingAction("regenerate");
            void onRegenerateDraft().then(() => {
              onFormalChange(false);
              onDirtyChange(false);
            }).catch((error) => onNotice("重新生成失败", error instanceof Error ? error.message : "请稍后重试。"))
              .finally(() => setPendingAction(null));
          }} />
        ) : null}
      </View>

      <View style={styles.editorStatusGrid}>
        <MiniStat label="编辑段落" value={recordSectionCountLabel(sections.length)} />
        <MiniStat label="模板" value="内置" />
        <MiniStat label="状态" value={formal ? "正式版" : dirty ? "未保存" : "草稿"} />
      </View>

      {sections.map((section, index) => (
        <View key={section.title} style={styles.editSection}>
          <View style={styles.editSectionHeader}>
            <Text style={styles.editSectionTitle}>{section.title}</Text>
            {!formal ? <Edit3 size={16} color={colors.subtle} /> : <LockKeyhole size={16} color={colors.subtle} />}
          </View>
          <TextInput
            value={section.content}
            editable={!formal}
            multiline
            onChangeText={(content) => {
              onSectionsChange(sections.map((item, itemIndex) => itemIndex === index ? { ...item, content } : item));
              onDirtyChange(true);
            }}
            style={[styles.editSectionInput, formal && styles.editSectionInputLocked]}
          />
        </View>
      ))}

      <View style={styles.savePanel}>
        {formal ? (
          <PrimaryButton icon={Edit3} label={pendingAction === "copy" ? "正在复制..." : "复制为草稿继续修改"} onPress={() => {
            if (pendingAction) return;
            setPendingAction("copy");
            void onCopyFormalToDraft().then(() => {
              onFormalChange(false);
              onDirtyChange(false);
              onNotice("已复制为草稿", "正式版保持不变；保存草稿后可替换正式版。");
            }).catch((error) => onNotice("复制草稿失败", error instanceof Error ? error.message : "请稍后重试。"))
              .finally(() => setPendingAction(null));
          }} wide disabled={pendingAction !== null} />
        ) : (
          <PrimaryButton icon={Save} label={pendingAction === "save" ? "正在保存..." : "保存为正式版"} onPress={() => {
            if (pendingAction) return;
            setPendingAction("save");
            void onSaveFormal().then(() => {
              onFormalChange(true);
              onDirtyChange(false);
              onNotice(`${recordType}已保存为正式版`, `本次${recordType}已进入档案；后续修改需先复制为草稿。`);
            }).catch((error) => onNotice("正式版保存失败", error instanceof Error ? error.message : "请稍后重试。"))
              .finally(() => setPendingAction(null));
          }} wide disabled={pendingAction !== null} />
        )}
        <GhostButton icon={Download} label={`下载${recordType} PDF`} onPress={() => {
          void onDownload()
            .then(() => onNotice("下载已开始", `${recordType}${formal ? "正式版" : "草稿"}正在下载到本地。`))
            .catch((error) => onNotice("下载失败", error instanceof Error ? error.message : "请稍后重试。"));
        }} />
        <GhostButton icon={ShieldCheck} label="授权长期保存草稿与正式版" onPress={onOpenPrivacy} />
      </View>
    </View>
  );
}

function CaseReportMaterialScreen({
  profile,
  sources,
  onGenerate,
  onNotice,
}: {
  profile: ArchiveResult;
  sources: ReportSource[];
  onGenerate: (selected: ReportSource[], options?: { confirmOverwriteDraft?: boolean }) => Promise<void>;
  onNotice: (title: string, detail: string) => void;
}) {
  const selectable = sources.filter((source) => source.analysisStatus === "available");
  // 个案报告按咨询师要求只依据「档案基本信息 + 每一次咨询记录」。
  // 量表、作业、附件等默认不勾选，避免无关资料稀释分析重点；仍可手动加选。
  const pickDefaultKeys = () => {
    const core = selectable.filter(
      (source) => source.resourceType === "profile" || source.resourceType === "report",
    );
    const chosen = core.length > 0 ? core : selectable.filter((source) => source.defaultSelected);
    return chosen.map((source) => `${source.resourceType}:${source.resourceId}`);
  };
  const [selected, setSelected] = useState<string[]>(pickDefaultKeys);
  const [generating, setGenerating] = useState(false);
  const [overwriteRequired, setOverwriteRequired] = useState(false);
  useEffect(() => {
    setSelected(pickDefaultKeys());
    setOverwriteRequired(false);
  }, [sources]);
  const toggle = (key: string) => {
    if (generating) return;
    setOverwriteRequired(false);
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  return (
    <View style={styles.stack}>
      <View style={styles.noticeCard}>
        <Sparkles size={23} color={colors.clayDark} />
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>{profile.profileName} · 个案报告</Text>
          <Text style={styles.listMeta}>基于全档案资料生成，不属于某一次咨询</Text>
        </View>
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>选择纳入分析的资料</Text>
        <Text style={styles.privacyCopy}>默认勾选档案基本信息与每一次咨询记录。量表、作业、附件等如需纳入可手动勾选；已销毁资料不能参与分析。</Text>
      </View>
      {overwriteRequired ? (
        <View style={styles.warningPanel}>
          <CircleAlert size={18} color={colors.danger} />
          <Text style={styles.warningText}>当前已有个案报告草稿。再次生成会覆盖未保存的草稿内容；已保存的正式版不受影响。</Text>
        </View>
      ) : null}
      <View style={styles.consentList}>
        {sources.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <FileText size={20} color={colors.subtle} />
            <Text style={styles.emptySearchTitle}>暂无可用于生成的资料</Text>
            <Text style={styles.emptySearchCopy}>先在档案中归档咨询记录、量表、作业或附件，再生成个案报告。</Text>
          </View>
        ) : null}
        {sources.length > 0 && selectable.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <CircleAlert size={20} color={colors.danger} />
            <Text style={styles.emptySearchTitle}>没有可参与分析的资料</Text>
            <Text style={styles.emptySearchCopy}>当前资料均已销毁或暂不可用，不能生成个案报告。</Text>
          </View>
        ) : null}
        {sources.map((source) => {
          const key = `${source.resourceType}:${source.resourceId}`;
          return source.analysisStatus === "available" ? (
          <ConsentItem
            key={key}
            title={source.label}
            meta="可参与个案报告生成"
            selected={selected.includes(key)}
            onPress={() => toggle(key)}
          />
        ) : (
          <View key={key} style={styles.lockedConsentItem}>
            <Trash2 size={18} color={colors.danger} />
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{source.label}</Text>
              <Text style={styles.listMeta}>{source.analysisStatus}，无法纳入分析</Text>
            </View>
          </View>
        );
        })}
      </View>
      <TouchableOpacity
        style={[
          styles.primaryButton,
          styles.wideButton,
          (selected.length === 0 || generating) && styles.pendingPrimaryButton,
        ]}
        activeOpacity={0.78}
        disabled={selected.length === 0 || generating}
        onPress={async () => {
          setGenerating(true);
          try {
            await onGenerate(selectable.filter((source) => selected.includes(
              `${source.resourceType}:${source.resourceId}`,
            )), { confirmOverwriteDraft: overwriteRequired });
            setOverwriteRequired(false);
          } catch (error) {
            if (error instanceof ApiError && error.code === "report_draft_exists") {
              setOverwriteRequired(true);
              onNotice("已有个案报告草稿", "请确认是否覆盖当前草稿后重新生成。");
              return;
            }
            onNotice("个案报告生成失败", error instanceof ApiError ? error.message : "无法连接后端服务，请稍后重试。");
          } finally {
            setGenerating(false);
          }
        }}
      >
        <Sparkles size={18} color="#FFF9F3" />
        <Text style={styles.primaryButtonText}>
          {generating
            ? "正在生成..."
            : selected.length > 0
              ? overwriteRequired ? "确认覆盖并重新生成草稿" : `使用 ${selected.length} 项资料生成草稿`
              : "至少选择一项资料"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function CaseReportEditorScreen({
  profile,
  sections,
  formal,
  onSectionsChange,
  onFormalChange,
  onSaveFormal,
  onCopyFormalToDraft,
  onDownload,
  onOpenPrivacy,
  onNotice,
}: {
  profile: ArchiveResult;
  sections: EditableRecordSection[];
  formal: boolean;
  onSectionsChange: (sections: EditableRecordSection[]) => void;
  onFormalChange: (formal: boolean) => void;
  onSaveFormal: () => Promise<void>;
  onCopyFormalToDraft: () => Promise<void>;
  onDownload: () => Promise<void>;
  onOpenPrivacy: () => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const [pendingAction, setPendingAction] = useState<"copy" | "save" | null>(null);
  return (
    <View style={styles.stack}>
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.editorEyebrow}>个案报告{formal ? "正式版" : "草稿"}</Text>
          <Text style={styles.editorTitle}>{profile.profileName} · 全档案</Text>
        </View>
        <Badge label={formal ? "正式版" : "草稿"} tone={formal ? "green" : "warm"} />
      </View>
      <View style={styles.ruleCard}>
        <CircleAlert size={19} color={colors.clayDark} />
        <Text style={styles.ruleText}>个案报告来自全部已选择资料。正式版不能直接编辑；重新生成只覆盖草稿，不覆盖正式版。</Text>
      </View>
      {sections.map((section, index) => (
        <View key={section.title} style={styles.editSection}>
          <View style={styles.editSectionHeader}>
            <Text style={styles.editSectionTitle}>{section.title}</Text>
            {formal ? <LockKeyhole size={16} color={colors.subtle} /> : <Edit3 size={16} color={colors.subtle} />}
          </View>
          <TextInput
            value={section.content}
            editable={!formal}
            multiline
            onChangeText={(content) => onSectionsChange(sections.map((item, itemIndex) => itemIndex === index ? { ...item, content } : item))}
            style={[styles.editSectionInput, formal && styles.editSectionInputLocked]}
          />
        </View>
      ))}
      <View style={styles.savePanel}>
        {formal ? (
          <PrimaryButton icon={Edit3} label={pendingAction === "copy" ? "正在复制..." : "复制为草稿继续修改"} onPress={async () => {
            if (pendingAction) return;
            setPendingAction("copy");
            try {
              await onCopyFormalToDraft();
              onFormalChange(false);
            } catch (error) {
              onNotice("复制草稿失败", error instanceof Error ? error.message : "请稍后重试。");
            } finally {
              setPendingAction(null);
            }
          }} wide disabled={pendingAction !== null} />
        ) : (
          <PrimaryButton icon={Save} label={pendingAction === "save" ? "正在保存..." : "保存个案报告正式版"} onPress={async () => {
            if (pendingAction) return;
            setPendingAction("save");
            try {
              await onSaveFormal();
              onFormalChange(true);
              onNotice("个案报告已保存为正式版", "正式版已进入档案，后续修改需要先复制为草稿。");
            } catch (error) {
              onNotice("正式版保存失败", error instanceof Error ? error.message : "请稍后重试。");
            } finally {
              setPendingAction(null);
            }
          }} wide disabled={pendingAction !== null} />
        )}
        <GhostButton icon={Download} label="下载个案报告 PDF" onPress={async () => {
          try {
            await onDownload();
            onNotice("报告已导出", caseReportDownloadNotice(Platform.OS, formal));
          } catch (error) {
            onNotice("报告导出失败", error instanceof Error ? error.message : "请稍后重试。");
          }
        }} />
        <GhostButton icon={ShieldCheck} label="授权长期保存个案报告" onPress={onOpenPrivacy} />
      </View>
    </View>
  );
}

function PrivacyCenterScreen({
  onNotice,
}: {
  onNotice: (title: string, detail: string) => void;
}) {
  const [expiringResources, setExpiringResources] = useState<SensitiveResource[]>([]);
  const [longTermResources, setLongTermResources] = useState<SensitiveResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAllExpiring, setShowAllExpiring] = useState(false);
  const [showAllLongTerm, setShowAllLongTerm] = useState(false);
  const PRIVACY_PAGE_LIMIT = 4;
  const visibleExpiring = showAllExpiring ? expiringResources : expiringResources.slice(0, PRIVACY_PAGE_LIMIT);
  const visibleLongTerm = showAllLongTerm ? longTermResources : longTermResources.slice(0, PRIVACY_PAGE_LIMIT);
  const load = async () => {
    setLoading(true);
    try {
      const [expiring, longTerm] = await Promise.all([
        privacyService.expiring(),
        privacyService.longTerm(),
      ]);
      setExpiringResources(expiring.items);
      setLongTermResources(longTerm.items);
    } catch (error) {
      onNotice("隐私资料加载失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const deleteResource = async (item: SensitiveResource) => {
    setDeletingId(item.id);
    try {
      await privacyService.delete(item.id);
      setPendingDeleteId(null);
      await load();
      onNotice("云端资料已删除", `“${item.displayName}”及其受保护内容已从后端销毁，无法恢复。`);
    } catch (error) {
      onNotice("资料删除失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        <ShieldCheck size={25} color={colors.sageDark} />
        <Text style={styles.posterTitle}>云端敏感资料默认保存 14 天</Text>
        <Text style={styles.posterCopy}>原始录音到期自动销毁且不能长期保存；其他敏感资料只有在你主动授权后才会长期保留。</Text>
      </View>

      <SectionHeader title="即将销毁资料" action={`${expiringResources.length} 项`} />
      <View style={styles.cardStack}>
        {loading ? <Text style={styles.listMeta}>正在读取后端保存状态...</Text> : null}
        {!loading && expiringResources.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <ShieldCheck size={20} color={colors.sageDark} />
            <Text style={styles.emptySearchTitle}>暂无即将销毁资料</Text>
            <Text style={styles.emptySearchCopy}>当前没有 14 天内到期的敏感资料。</Text>
          </View>
        ) : null}
        {visibleExpiring.map((item) => (
          <View key={item.id} style={styles.privacyResourceCard}>
            <View style={styles.privacyResourceMain}>
              <Clock3 size={18} color={item.canLongTermPreserve ? colors.clayDark : colors.danger} />
              <View style={styles.listBody}>
                <Text style={styles.listTitle}>{item.displayName}</Text>
                <Text style={styles.listMeta}>
                  {privacyResourceTypeLabel(item.resourceType)} · {new Date(item.expiresAt).toLocaleString("zh-CN")} 到期
                </Text>
              </View>
            </View>
            <View style={styles.privacyResourceFooter}>
              {item.canLongTermPreserve ? (
              <TouchableOpacity
                style={styles.smallActionButton}
                onPress={async () => {
                  try {
                    await privacyService.authorize(item.id);
                    await load();
                    onNotice("已授权长期保存", `“${item.displayName}”会保留在已长期保存资料中。`);
                  } catch (error) {
                    onNotice("授权失败", error instanceof Error ? error.message : "请稍后重试。");
                  }
                }}
              >
                <ShieldCheck size={15} color={colors.clayDark} />
                <Text style={styles.smallActionText}>长期保存</Text>
              </TouchableOpacity>
              ) : (
                <Badge label="不可授权" tone="blue" />
              )}
              <TouchableOpacity
                style={[
                  styles.sessionToolButton,
                  pendingDeleteId === item.id && styles.sessionToolButtonDanger,
                ]}
                onPress={() => setPendingDeleteId(
                  pendingDeleteId === item.id ? null : item.id,
                )}
              >
                <Trash2 size={14} color={pendingDeleteId === item.id ? colors.danger : colors.clayDark} />
                <Text style={[
                  styles.sessionToolText,
                  pendingDeleteId === item.id && styles.sessionToolTextDanger,
                ]}>
                  {pendingDeleteId === item.id ? "取消删除" : "删除资料"}
                </Text>
              </TouchableOpacity>
            </View>
            {pendingDeleteId === item.id ? (
              <View style={styles.privacyDeleteConfirm}>
                <Text style={styles.dangerCopy}>确认永久删除“{item.displayName}”？后端将立即销毁关联内容，操作不可恢复。</Text>
                <TouchableOpacity
                  style={[
                    styles.dangerButton,
                    deletingId === item.id && styles.dangerButtonDisabled,
                  ]}
                  disabled={deletingId === item.id}
                  onPress={() => void deleteResource(item)}
                >
                  <Trash2 size={15} color={colors.danger} />
                  <Text style={styles.dangerButtonText}>
                    {deletingId === item.id ? "正在删除..." : "确认永久删除"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))}
        {expiringResources.length > PRIVACY_PAGE_LIMIT ? (
          <TouchableOpacity style={styles.listMoreRow} activeOpacity={0.78} onPress={() => setShowAllExpiring((current) => !current)}>
            <Text style={styles.listMoreText}>
              {showAllExpiring ? "收起" : `显示更多（共 ${expiringResources.length} 项）`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <SectionHeader title="已长期保存资料" action={`${longTermResources.length} 项`} />
      {longTermResources.length > 0 ? (
        <View style={styles.cardStack}>
          {visibleLongTerm.map((item) => (
            <View key={item.id} style={styles.privacyResourceCard}>
              <View style={styles.privacyResourceMain}>
                <CheckCircle2 size={18} color={colors.sageDark} />
                <View style={styles.listBody}>
                  <Text style={styles.listTitle}>{item.displayName}</Text>
                  <Text style={styles.listMeta}>已由你主动授权长期保留</Text>
                </View>
              </View>
              <View style={styles.privacyResourceFooter}>
                <TouchableOpacity
                  style={styles.smallActionButton}
                  onPress={async () => {
                    try {
                      await privacyService.revoke(item.id);
                      await load();
                      onNotice("已撤回长期保存", "若原临时期限已结束，后端会立即销毁资料。");
                    } catch (error) {
                      onNotice("撤回失败", error instanceof Error ? error.message : "请稍后重试。");
                    }
                  }}
                >
                  <X size={14} color={colors.clayDark} />
                  <Text style={styles.smallActionText}>撤回授权</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sessionToolButton,
                    pendingDeleteId === item.id && styles.sessionToolButtonDanger,
                  ]}
                  onPress={() => setPendingDeleteId(
                    pendingDeleteId === item.id ? null : item.id,
                  )}
                >
                  <Trash2 size={14} color={pendingDeleteId === item.id ? colors.danger : colors.clayDark} />
                  <Text style={[
                    styles.sessionToolText,
                    pendingDeleteId === item.id && styles.sessionToolTextDanger,
                  ]}>
                    {pendingDeleteId === item.id ? "取消删除" : "删除资料"}
                  </Text>
                </TouchableOpacity>
              </View>
              {pendingDeleteId === item.id ? (
                <View style={styles.privacyDeleteConfirm}>
                  <Text style={styles.dangerCopy}>确认永久删除“{item.displayName}”？长期保存授权也会一并终止，操作不可恢复。</Text>
                  <TouchableOpacity
                    style={[
                      styles.dangerButton,
                      deletingId === item.id && styles.dangerButtonDisabled,
                    ]}
                    disabled={deletingId === item.id}
                    onPress={() => void deleteResource(item)}
                  >
                    <Trash2 size={15} color={colors.danger} />
                    <Text style={styles.dangerButtonText}>
                      {deletingId === item.id ? "正在删除..." : "确认永久删除"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))}
          {longTermResources.length > PRIVACY_PAGE_LIMIT ? (
            <TouchableOpacity style={styles.listMoreRow} activeOpacity={0.78} onPress={() => setShowAllLongTerm((current) => !current)}>
              <Text style={styles.listMoreText}>
                {showAllLongTerm ? "收起" : `显示更多（共 ${longTermResources.length} 项）`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptySearchCard}>
          <ShieldCheck size={20} color={colors.subtle} />
          <Text style={styles.emptySearchTitle}>暂无长期保存资料</Text>
          <Text style={styles.emptySearchCopy}>长期保存不会默认开启，需要逐项主动授权。</Text>
        </View>
      )}

      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>删除与外部暴露风险</Text>
        <Text style={styles.privacyCopy}>删除云端资料后不可恢复。下载到本地的文件由你自行保管；同步手机日历时，系统日历和锁屏可能显示事件标题。</Text>
      </View>
    </View>
  );
}

const PRIVACY_CATEGORY_TABS: Array<{ key: PrivacyCategoryKey; label: string }> = [
  { key: "recording", label: "录音" },
  { key: "transcript", label: "转写" },
  { key: "summary", label: "纪要" },
  { key: "scale", label: "量表" },
  { key: "homework", label: "作业" },
  { key: "other", label: "其他" },
  { key: "session_record", label: "咨询记录" },
  { key: "case_report", label: "个案报告" },
];

function profilePrivacyExpiry(item: PrivacyResourceItem): string {
  if (item.authorized) return "已授权长期保留";
  if (!item.expiresAt) return "随档案保留";
  const date = new Date(item.expiresAt);
  if (Number.isNaN(date.getTime())) return "到期时间未知";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day} 到期`;
}

function ProfilePrivacyRow({
  item,
  pending,
  onAuthorize,
  onRevoke,
}: {
  item: PrivacyResourceItem;
  pending: boolean;
  onAuthorize: () => void;
  onRevoke: () => void;
}) {
  return (
    <View style={styles.privacyResourceCard}>
      <View style={styles.privacyResourceMain}>
        {item.authorized
          ? <CheckCircle2 size={18} color={colors.sageDark} />
          : <Clock3 size={18} color={item.expiringSoon ? colors.danger : colors.clayDark} />}
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>{truncateMiddle(item.title)}</Text>
          <Text style={styles.listMeta}>{item.source} · {profilePrivacyExpiry(item)}</Text>
        </View>
      </View>
      <View style={styles.privacyResourceFooter}>
        {!item.preservable ? (
          <Badge label={item.kind === "attachment" ? "随档案保留" : "不可授权"} tone="blue" />
        ) : item.authorized ? (
          <TouchableOpacity style={styles.smallActionButton} activeOpacity={0.75} onPress={onRevoke} disabled={pending}>
            <X size={14} color={colors.clayDark} />
            <Text style={styles.smallActionText}>{pending ? "处理中..." : "撤回授权"}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.smallActionButton} activeOpacity={0.75} onPress={onAuthorize} disabled={pending}>
            <ShieldCheck size={15} color={colors.clayDark} />
            <Text style={styles.smallActionText}>{pending ? "处理中..." : "长期保存"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ProfilePrivacyScreen({
  profileId,
  profileName,
  profileType,
  onNotice,
}: {
  profileId: string;
  profileName: string;
  profileType: string;
  onNotice: (title: string, detail: string) => void;
}) {
  const [category, setCategory] = useState<PrivacyCategoryKey>("summary");
  const [page, setPage] = useState<ProfilePrivacyPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPage(await privacyService.profileResources(profileId, category));
    } catch (error) {
      onNotice("隐私资料加载失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [category, onNotice, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const authorize = async (item: PrivacyResourceItem) => {
    setPendingId(item.id);
    try {
      await privacyService.authorize(item.id);
      await load();
      onNotice("已授权长期保存", `“${item.title}”会保留在已长期保存资料中。`);
    } catch (error) {
      onNotice("授权失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setPendingId(null);
    }
  };

  const revoke = async (item: PrivacyResourceItem) => {
    setPendingId(item.id);
    try {
      await privacyService.revoke(item.id);
      await load();
      onNotice("已撤回长期保存", "若原临时期限已结束，后端会立即销毁资料。");
    } catch (error) {
      onNotice("撤回失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setPendingId(null);
    }
  };

  const items = page?.items ?? [];
  const authorized = items.filter((item) => item.authorized);
  const unauthorized = items.filter((item) => !item.authorized);
  const currentLabel = PRIVACY_CATEGORY_TABS.find((tab) => tab.key === category)?.label ?? "";

  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        <ShieldCheck size={25} color={colors.sageDark} />
        <Text style={styles.posterTitle}>{profileName} · {profileType}档案</Text>
        <Text style={styles.posterCopy}>按分类管理这个档案的敏感资料。原始录音到期自动销毁且不能长期保存；其他资料需逐项主动授权。</Text>
      </View>

      <View style={styles.editorStatusGrid}>
        <MiniStat label="当前分类" value={currentLabel} />
        <MiniStat label="已授权" value={`${page?.summary.authorized ?? 0} 项`} />
        <MiniStat label="即将到期" value={`${page?.summary.expiringSoon ?? 0} 项`} />
      </View>

      <View style={styles.categoryTabs}>
        {PRIVACY_CATEGORY_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.choicePill, category === tab.key && styles.choicePillActive]}
            activeOpacity={0.75}
            onPress={() => setCategory(tab.key)}
          >
            <Text style={[styles.choicePillText, category === tab.key && styles.choicePillTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <Text style={styles.listMeta}>正在读取隐私资料...</Text> : null}

      {!loading && items.length === 0 ? (
        <View style={styles.emptySearchCard}>
          <ShieldCheck size={20} color={colors.subtle} />
          <Text style={styles.emptySearchTitle}>该分类暂无资料</Text>
          <Text style={styles.emptySearchCopy}>切换到其他分类，或先归档录音、生成记录后再来管理。</Text>
        </View>
      ) : null}

      {unauthorized.length > 0 ? (
        <>
          <SectionHeader title={`未授权 · 到期后销毁`} action={`${unauthorized.length} 项`} />
          <View style={styles.cardStack}>
            {unauthorized.map((item) => (
              <ProfilePrivacyRow
                key={item.id}
                item={item}
                pending={pendingId === item.id}
                onAuthorize={() => void authorize(item)}
                onRevoke={() => void revoke(item)}
              />
            ))}
          </View>
        </>
      ) : null}

      {authorized.length > 0 ? (
        <>
          <SectionHeader title={`已授权长期保存`} action={`${authorized.length} 项`} />
          <View style={styles.cardStack}>
            {authorized.map((item) => (
              <ProfilePrivacyRow
                key={item.id}
                item={item}
                pending={pendingId === item.id}
                onAuthorize={() => void authorize(item)}
                onRevoke={() => void revoke(item)}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>关于量表、作业与其他附件</Text>
        <Text style={styles.privacyCopy}>这类资料随档案保留，不进入 14 天自动销毁，也不需要单独授权；删除请在对应咨询历程的资料页操作。</Text>
      </View>
    </View>
  );
}

function SupervisionScreen({
  profiles,
  onNotice,
}: {
  profiles: ProfileListItem[];
  onNotice: (title: string, detail: string) => void;
}) {
  const contextOptions = profiles.map((profile) => ({
    id: profile.id,
    title: `${profile.name} · ${profile.type}档案`,
    type: "档案",
  }));
  const [showContexts, setShowContexts] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [conversations, setConversations] = useState<SupervisionConversation[]>([]);
  const [conversation, setConversation] = useState<SupervisionConversation | null>(null);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState("");
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [contextUnlock, setContextUnlock] = useState<{
    profile: ProfileListItem;
    passwordSet: boolean;
  } | null>(null);
  const [contextPassword, setContextPassword] = useState("");
  const [contextUnlocking, setContextUnlocking] = useState(false);

  useEffect(() => {
    void supervisionService.list().then((items) => {
      setConversations(items);
      if (items[0]) {
        setConversation(items[0]);
      } else {
        setConversation(null);
        setShowConversations(true);
      }
    }).catch((error) => {
      onNotice("督导会话加载失败", error instanceof Error ? error.message : "请稍后重试。");
    });
  }, []);

  const refreshConversation = async (conversationId: string) => {
    const refreshed = await supervisionService.get(conversationId);
    setConversation(refreshed);
    setConversations((current) => [
      refreshed,
      ...current.filter((item) => item.id !== refreshed.id),
    ]);
  };
  const createConversation = async () => {
    setCreatingConversation(true);
    try {
      const result = await createConversationAndSelect(
        (title) => supervisionService.createConversation(title),
        newConversationTitle,
        conversations,
      );
      setConversations(result.items);
      setConversation(result.active);
      setNewConversationTitle("");
      setShowConversations(false);
    } catch (error) {
      onNotice("会话创建失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setCreatingConversation(false);
    }
  };
  const deleteConversation = async (conversationId: string) => {
    setDeletingConversationId(conversationId);
    try {
      const result = await deleteConversationAndSelect(
        (id) => supervisionService.deleteConversation(id),
        conversations,
        conversation?.id ?? null,
        conversationId,
      );
      setConversations(result.items);
      setConversation(result.active);
      setPendingDeleteConversationId(null);
    } catch (error) {
      onNotice("会话删除失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setDeletingConversationId(null);
    }
  };

  const toggleContext = async (context: { id: string; title: string; type: string }) => {
    if (!conversation) return;
    const existing = conversation.contextRefs.find(
      (item) => item.resourceType === "profile" && item.resourceId === context.id,
    );
    try {
      if (existing) {
        await supervisionService.removeContext(conversation.id, existing.id);
      } else {
        await supervisionService.addContext(conversation.id, [{
          resourceType: "profile",
          resourceId: context.id,
        }]);
      }
      await refreshConversation(conversation.id);
    } catch (error) {
      if (
        !existing
        && error instanceof ApiError
        && ["profile_access_grant_required", "profile_access_grant_invalid"].includes(error.code)
      ) {
        const profile = profiles.find((item) => item.id === context.id);
        if (profile) {
          try {
            const kind = archiveKindForProfile(profile);
            const statuses = await profileAccessService.statuses();
            setContextUnlock({
              profile,
              passwordSet: statuses.items.find((item) => item.profile_type === kind)?.is_set ?? false,
            });
            setContextPassword("");
            return;
          } catch (statusError) {
            onNotice(
              "无法验证档案权限",
              statusError instanceof Error ? statusError.message : "请稍后重试。",
            );
            return;
          }
        }
      }
      onNotice("上下文更新失败", error instanceof Error ? error.message : "请稍后重试。");
    }
  };
  const selectedCount = conversation?.contextRefs.length ?? 0;
  const composerBlockedByProfileAccess = Boolean(contextUnlock);
  const composerDisabled = !input.trim() || generating || !conversation || composerBlockedByProfileAccess;

  return (
    <View style={styles.stack}>
      <View style={styles.aiPanel}>
        <Sparkles size={24} color={colors.clayDark} />
        <Text style={styles.aiTitle}>{selectedCount > 0 ? `已添加 ${selectedCount} 项资料` : "本次会话未添加资料"}</Text>
        <Text style={styles.aiCopy}>{selectedCount > 0 ? "AI 仅可读取下方勾选资料，回答会逐项显示引用来源。" : "AI 不会读取任何档案内容。添加资料后，回答会显示引用来源。"}</Text>
        <View style={styles.inlineActions}>
          <GhostButton
            icon={Plus}
            label={showContexts ? "收起资料" : "添加资料"}
            onPress={() => {
              if (!conversation) {
                setShowConversations(true);
                onNotice("请先创建会话", "创建督导会话后才能添加档案资料。");
                return;
              }
              setShowContexts((current) => !current);
            }}
          />
          <GhostButton icon={History} label={showConversations ? "返回会话" : "会话列表"} onPress={() => setShowConversations((current) => !current)} />
        </View>
      </View>

      {showContexts ? (
        <>
          {contextUnlock ? (
            <View style={styles.inlineCreateCard}>
              <Text style={styles.formPreviewTitle}>
                {contextUnlock.passwordSet ? "验证档案访问密码" : "设置档案访问密码"}
              </Text>
              <Text style={styles.listMeta}>
                {contextUnlock.profile.name} · {contextUnlock.profile.type}档案，仅授权本次添加操作
              </Text>
              <TextInput
                value={contextPassword}
                onChangeText={(value) => setContextPassword(normalizeAccessPinInput(value))}
                placeholder="6 位数字密码"
                placeholderTextColor={colors.subtle}
                style={styles.archiveTextInput}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
                autoCapitalize="none"
              />
              <View style={styles.inlineActions}>
                <GhostButton
                  icon={X}
                  label="取消"
                  onPress={() => {
                    profileAccessService.leaveProfile();
                    setContextUnlock(null);
                    setContextPassword("");
                  }}
                />
                <TouchableOpacity
                  style={[
                    styles.inlineCreateConfirm,
                    (!isCompleteAccessPin(contextPassword) || contextUnlocking)
                    && styles.inlineCreateConfirmDisabled,
                  ]}
                  disabled={!isCompleteAccessPin(contextPassword) || contextUnlocking}
                  onPress={() => {
                    if (!conversation) return;
                    setContextUnlocking(true);
                    const pending = contextUnlock;
                    const kind = archiveKindForProfile(pending.profile);
                    void (async () => {
                      try {
                        if (!pending.passwordSet) {
                          await profileAccessService.setPassword(kind, contextPassword);
                        }
                        await profileAccessService.verify(kind, contextPassword);
                        await supervisionService.addContext(conversation.id, [{
                          resourceType: "profile",
                          resourceId: pending.profile.id,
                        }]);
                        await refreshConversation(conversation.id);
                        setContextUnlock(null);
                        setContextPassword("");
                      } catch (error) {
                        onNotice(
                          "档案验证失败",
                          error instanceof Error ? error.message : "请稍后重试。",
                        );
                      } finally {
                        profileAccessService.leaveProfile();
                        setContextUnlocking(false);
                      }
                    })();
                  }}
                >
                  <Text style={styles.inlineCreateConfirmText}>
                    {contextUnlocking ? "正在验证..." : "验证并添加"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View style={styles.consentList}>
            {contextOptions.map((context) => (
              <ConsentItem
                key={context.id}
                title={context.title}
                meta={`${context.type} · 仅用于本次会话`}
                selected={conversation?.contextRefs.some((item) => item.resourceId === context.id) ?? false}
                onPress={() => void toggleContext(context)}
              />
            ))}
          </View>
        </>
      ) : null}

      {showConversations ? (
        <View style={styles.cardStack}>
          <View style={styles.inlineCreateCard}>
            <Text style={styles.formPreviewTitle}>新建督导会话</Text>
            <Text style={styles.listMeta}>每个会话的资料授权、消息和到期时间彼此独立。</Text>
            <TextInput
              value={newConversationTitle}
              onChangeText={setNewConversationTitle}
              placeholder="会话名称，例如：本周个案督导"
              placeholderTextColor={colors.subtle}
              style={styles.archiveTextInput}
              maxLength={80}
            />
            <TouchableOpacity
              style={[
                styles.inlineCreateConfirm,
                creatingConversation && styles.inlineCreateConfirmDisabled,
              ]}
              disabled={creatingConversation}
              onPress={() => void createConversation()}
            >
              <Text style={styles.inlineCreateConfirmText}>
                {creatingConversation ? "正在创建..." : "创建并进入会话"}
              </Text>
            </TouchableOpacity>
          </View>
          {conversations.length === 0 ? (
            <View style={styles.emptySearchCard}>
              <History size={20} color={colors.subtle} />
              <Text style={styles.emptySearchTitle}>暂无督导会话</Text>
              <Text style={styles.emptySearchCopy}>填写上方名称即可开始一个新的独立会话。</Text>
            </View>
          ) : null}
          {conversations.map((item) => (
            <View key={item.id} style={styles.conversationCard}>
              <TouchableOpacity style={styles.conversationSelect} activeOpacity={0.78} onPress={() => {
                setConversation(item);
                setPendingDeleteConversationId(null);
                setShowConversations(false);
              }}>
                <View style={styles.listBody}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Text style={styles.listMeta}>{item.messages.length} 条消息 · {item.contextRefs.length} 项资料</Text>
                </View>
                {conversation?.id === item.id ? <Badge label="当前" tone="green" /> : <ChevronRight size={18} color={colors.subtle} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.conversationDelete,
                  pendingDeleteConversationId === item.id && styles.sessionToolButtonDanger,
                ]}
                disabled={deletingConversationId === item.id}
                onPress={() => {
                  if (pendingDeleteConversationId !== item.id) {
                    setPendingDeleteConversationId(item.id);
                    return;
                  }
                  void deleteConversation(item.id);
                }}
              >
                <Trash2 size={14} color={pendingDeleteConversationId === item.id ? colors.danger : colors.clayDark} />
                <Text style={[
                  styles.sessionToolText,
                  pendingDeleteConversationId === item.id && styles.sessionToolTextDanger,
                ]}>
                  {deletingConversationId === item.id
                    ? "正在删除..."
                    : pendingDeleteConversationId === item.id ? "确认删除会话" : "删除"}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <>
          {(conversation?.messages ?? []).map((message) => (
            <View key={message.id} style={styles.chatMessageGroup}>
              <ChatBubble align={chatBubbleAlignForRole(message.role)} text={message.content} />
              {message.citations.length > 0 ? (
                <View style={styles.citationPanel}>
                  <Text style={styles.citationTitle}>引用来源</Text>
                  {message.citations.map((citation) => <Text key={`${citation.resource_type}-${citation.resource_id}`} style={styles.citationText}>{citation.label}</Text>)}
                </View>
              ) : null}
            </View>
          ))}
          {generating ? (
            <View style={styles.processingChat}>
              <RefreshCcw size={17} color={colors.clayDark} />
              <Text style={styles.listMeta}>正在基于 {selectedCount} 项已选资料生成回答</Text>
            </View>
          ) : null}
        </>
      )}
      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          editable={!generating && !composerBlockedByProfileAccess}
          placeholder={composerBlockedByProfileAccess ? "请先验证档案密码" : "输入想讨论的主题"}
          placeholderTextColor={colors.subtle}
          style={styles.composerInput}
        />
        <TouchableOpacity accessibilityLabel="发送督导问题" style={[styles.sendButton, composerDisabled && styles.sendButtonDisabled]} activeOpacity={0.75} disabled={composerDisabled} onPress={() => {
          const question = input.trim();
          setInput("");
          setGenerating(true);
          setShowConversations(false);
          void supervisionService.sendMessage(conversation!.id, question)
            .then(async (result) => {
              if (result.riskPrompt) onNotice("危机风险提醒", result.riskPrompt);
              await refreshConversation(conversation!.id);
            })
            .catch((error) => {
              setInput(question);
              onNotice("督导回复失败", error instanceof Error ? error.message : "请稍后重试。");
            })
            .finally(() => setGenerating(false));
        }}>
          <SendHorizontal size={17} color="#FFF9F3" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ContentScreen({ onOpen }: { onOpen: (article: (typeof articles)[number]) => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        <BookOpenText size={25} color={colors.clayDark} />
        <Text style={styles.posterTitle}>专业资讯</Text>
        <Text style={styles.posterCopy}>记录书写、隐私伦理、督导准备和风险识别的轻量参考。</Text>
      </View>
      <SectionHeader title="书写参考" />
      {articles.map((article) => <ArticleRow key={article.id} title={article.title} tag={article.tag} onPress={() => onOpen(article)} />)}
    </View>
  );
}

const PROFILE_KIND_LABELS: Record<string, string> = {
  client: "来访者",
  supervisor: "督导师",
  supervisee: "受督者",
};

function AccountScreen({
  user,
  onOpenPrivacy,
  onOpenProfilePrivacy,
  onOpenSecurity,
  onNotice,
  onUpdateProfile,
  onLogout,
}: {
  user: CurrentUser | null;
  onOpenPrivacy: () => void;
  onOpenProfilePrivacy: (profileId: string) => void;
  onOpenSecurity: (section?: SecuritySection) => void;
  onNotice: (title: string, detail: string) => void;
  onUpdateProfile: (displayName: string) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const displayName = user?.display_name || "咨询师";
  const [privacyAlerts, setPrivacyAlerts] = useState<ExpiringByProfileItem[]>([]);
  const [calendarSummary, setCalendarSummary] = useState(
    calendarSettingSummary({
      systemCalendarEnabled: false,
      privacyTitleModeEnabled: true,
    }),
  );
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(displayName);
  const [savingProfile, setSavingProfile] = useState(false);
  useEffect(() => {
    setDisplayNameDraft(displayName);
  }, [displayName]);
  useEffect(() => {
    void privacyService.expiringByProfile(14)
      .then((response) => setPrivacyAlerts(response.items))
      .catch(() => setPrivacyAlerts([]));
    void calendarService.settings()
      .then((settings) => setCalendarSummary(calendarSettingSummary(settings)))
      .catch(() => setCalendarSummary(calendarSettingSummary({
        systemCalendarEnabled: false,
        privacyTitleModeEnabled: true,
      })));
  }, []);
  return (
    <View style={styles.stack}>
      <TouchableOpacity style={styles.accountCard} activeOpacity={0.78} onPress={() => setEditingProfile((current) => !current)}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>{displayName.slice(0, 1)}</Text>
        </View>
        <View style={styles.listBody}>
          <Text style={styles.accountName}>{displayName}</Text>
          <Text style={styles.listMeta}>{user?.email ?? "个人版"}</Text>
        </View>
        <Edit3 size={20} color={colors.subtle} />
      </TouchableOpacity>
      {editingProfile ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>编辑个人资料</Text>
          <Text style={styles.listMeta}>邮箱作为登录账号不可在此修改；展示名称保存到后端账号资料。</Text>
          <TextInput
            value={displayNameDraft}
            onChangeText={setDisplayNameDraft}
            placeholder="展示名称"
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
            maxLength={80}
          />
          <View style={styles.inlineActions}>
            <GhostButton
              icon={X}
              label="取消"
              onPress={() => {
                setDisplayNameDraft(displayName);
                setEditingProfile(false);
              }}
            />
            <TouchableOpacity
              style={[
                styles.inlineCreateConfirm,
                styles.profileSaveButton,
                savingProfile && styles.inlineCreateConfirmDisabled,
              ]}
              disabled={savingProfile}
              onPress={() => {
                void (async () => {
                  try {
                    const normalized = normalizeDisplayName(displayNameDraft);
                    setSavingProfile(true);
                    await onUpdateProfile(normalized);
                    setEditingProfile(false);
                    onNotice("个人资料已保存", "展示名称已写入后端账号资料。");
                  } catch (error) {
                    onNotice("个人资料保存失败", error instanceof Error ? error.message : "请稍后重试。");
                  } finally {
                    setSavingProfile(false);
                  }
                })();
              }}
            >
              <Save size={15} color="#FFF9F3" />
              <Text style={styles.inlineCreateConfirmText}>
                {savingProfile ? "正在保存..." : "保存资料"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <SectionHeader title="数据与隐私" action="查看" onAction={onOpenPrivacy} />
      {privacyAlerts.length === 0 ? (
        <View style={styles.cardStack}>
          <TouchableOpacity style={styles.privacyResource} activeOpacity={0.78} onPress={onOpenPrivacy}>
            <ShieldCheck size={18} color={colors.sageDark} />
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>暂无需要关注的资料</Text>
              <Text style={styles.listMeta}>未来 14 天内没有即将销毁的敏感资料</Text>
            </View>
            <Badge label="正常" tone="green" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cardStack}>
          {privacyAlerts.map((alert) => {
            const nearest = alert.nearestExpiresAt ? new Date(alert.nearestExpiresAt) : null;
            const nearestText = nearest && !Number.isNaN(nearest.getTime())
              ? ` · 最近 ${nearest.getMonth() + 1}月${nearest.getDate()}日`
              : "";
            return (
              <TouchableOpacity
                key={alert.profile.id}
                style={styles.profileCard}
                activeOpacity={0.78}
                onPress={() => onOpenProfilePrivacy(alert.profile.id)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{alert.profile.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.listBody}>
                  <Text style={styles.listTitle}>
                    {alert.profile.name} · {PROFILE_KIND_LABELS[alert.profile.type] ?? alert.profile.type}档案
                  </Text>
                  <Text style={styles.listMeta}>{alert.expiringCount} 项资料即将到期{nearestText}</Text>
                </View>
                <Badge label="需关注" tone="warm" />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <SectionHeader title="安全" action="设置" onAction={() => onOpenSecurity("profileAccess")} />
      <View style={styles.settingsList}>
        <SettingsRow icon={LockKeyhole} title="档案访问密码" value="三类档案独立 6 位数字密码" onPress={() => onOpenSecurity("profileAccess")} />
        <SettingsRow
          icon={CalendarDays}
          title="手机日历同步"
          value={`${calendarSummary.calendarSync} · ${calendarSummary.privacyTitle}`}
          onPress={() => onOpenSecurity("calendar")}
        />
        <SettingsRow icon={ShieldCheck} title="账号安全" value="邮箱登录" onPress={() => onOpenSecurity("account")} />
        <SettingsRow icon={LogOut} title="退出登录" value="清除本机安全会话" onPress={() => void onLogout()} />
      </View>
      <Text style={styles.buildTag}>
        构建版本 {BUILD_TAG} · 若功能与预期不符，请先卸载 App 再重新安装
      </Text>
    </View>
  );
}

function ArticleDetailScreen({ article }: { article: (typeof articles)[number] }) {
  return (
    <View style={styles.stack}>
      <View style={styles.articleHero}>
        <Badge label={article.tag} tone="blue" />
        <Text style={styles.articleDetailTitle}>{article.title}</Text>
        <Text style={styles.articleLead}>{article.summary}</Text>
      </View>
      <SectionHeader title="要点" />
      {article.sections.map((section, index) => (
        <View key={section} style={styles.articlePoint}>
          <Text style={styles.articlePointIndex}>{index + 1}</Text>
          <Text style={styles.articlePointText}>{section}</Text>
        </View>
      ))}
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>使用提醒</Text>
        <Text style={styles.privacyCopy}>资讯用于工作提示，不能替代伦理规范、机构制度、专业督导或紧急风险处置。</Text>
      </View>
    </View>
  );
}

function StatisticsScreen({ durationStats }: { durationStats: RecordingDurationStatistics | null }) {
  const rows = ([
    { title: "咨询", kind: "client" as const },
    { title: "接受督导", kind: "supervisor" as const },
    { title: "提供督导", kind: "supervisee" as const },
  ]).map((row) => {
    const stat = recordingDurationStat(durationStats, row.kind);
    return {
      title: row.title,
      value: `${(stat.seconds / 3600).toFixed(1)} 小时`,
      detail: `${stat.count} 条已记录录音`,
      seconds: stat.seconds,
    };
  });
  const uncategorized = recordingDurationStat(durationStats, null);
  const totalSeconds = durationStats?.totalSeconds ?? rows.reduce((total, row) => total + row.seconds, 0);
  const now = new Date();
  return (
    <View style={styles.stack}>
      <View style={styles.metricSummary}>
        <Text style={styles.metricSummaryLabel}>{now.toLocaleDateString("zh-CN")}</Text>
        <Text style={styles.metricSummaryValue}>{(totalSeconds / 3600).toFixed(1)}h</Text>
        <Text style={styles.metricSummaryCopy}>已记录录音总时长，包含上传音频</Text>
      </View>
      <View style={styles.cardStack}>
        {rows.map((row) => (
          <View key={row.title} style={styles.listCard}>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{row.title}</Text>
              <Text style={styles.listMeta}>{row.detail}</Text>
            </View>
            <Text style={styles.statValue}>{row.value}</Text>
          </View>
        ))}
        {uncategorized.count > 0 ? (
          <View style={styles.listCard}>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>未归档录音</Text>
              <Text style={styles.listMeta}>{uncategorized.count} 条已记录录音</Text>
            </View>
            <Text style={styles.statValue}>{(uncategorized.seconds / 3600).toFixed(1)} 小时</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>统计口径</Text>
        <Text style={styles.privacyCopy}>按录音绑定音频时写入的时长统计，含上传音频；原始音频到期销毁后，时长统计仍保留。归档后计入对应身份。</Text>
      </View>
    </View>
  );
}

function ScheduleScreen({
  onStartRecording,
  onNotice,
}: {
  onStartRecording: () => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const categoryLabels: Record<string, string> = {
    counseling: "咨询",
    supervision_received: "接受督导",
    supervision_provided: "提供督导",
    personal: "个人安排",
  };
  const calendarDriver = useMemo(() => createExpoCalendarDriver(), []);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [privacyTitles, setPrivacyTitles] = useState(true);
  const [systemSync, setSystemSync] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [savingPrivacyTitles, setSavingPrivacyTitles] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => toDateKey(new Date()));
  const pendingEventCounts = useMemo(() => events.reduce<Record<string, number>>((counts, event) => {
    if (event.status !== "pending") return counts;
    const key = toDateKey(new Date(event.startAt));
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}), [events]);
  const monthDays = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const key = toDateKey(date);
      return {
        key,
        day: date.getDate(),
        isCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
        isToday: key === toDateKey(new Date()),
        count: pendingEventCounts[key] ?? 0,
      };
    });
  }, [pendingEventCounts, visibleMonth]);
  const selectedDate = useMemo(() => {
    const [year, month, day] = selectedDay.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDay]);
  const selectedDayLabel = `${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][selectedDate.getDay()]} ${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`;

  const load = async () => {
    try {
      const [settings, eventPage] = await Promise.all([
        calendarService.settings(),
        calendarService.listEvents(),
      ]);
      setPrivacyTitles(settings.privacyTitleModeEnabled);
      setSystemSync(settings.systemCalendarEnabled);
      setEvents(eventPage.items);
    } catch (error) {
      onNotice("日程加载失败", error instanceof Error ? error.message : "请稍后重试。");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const scheduleRows = events.filter((event) => {
    return toDateKey(new Date(event.startAt)) === selectedDay && event.status === "pending";
  });

  return (
    <View style={styles.stack}>
      <View style={styles.calendarPanel}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            style={styles.calendarNavButton}
            activeOpacity={0.78}
            onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
          >
            <Text style={styles.calendarNavText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.listBody}>
            <Text style={styles.calendarTitle}>{visibleMonth.getFullYear()}年{visibleMonth.getMonth() + 1}月</Text>
            <Text style={styles.listMeta}>点击日期查看当天安排</Text>
          </View>
          <TouchableOpacity
            style={styles.calendarNavButton}
            activeOpacity={0.78}
            onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          >
            <Text style={styles.calendarNavText}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.calendarWeekRow}>
          {["日", "一", "二", "三", "四", "五", "六"].map((weekday) => (
            <Text key={weekday} style={styles.calendarWeekday}>{weekday}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {monthDays.map((day) => (
            <TouchableOpacity
              key={day.key}
              style={[
                styles.calendarDay,
                !day.isCurrentMonth && styles.calendarDayMuted,
                selectedDay === day.key && styles.calendarDayActive,
              ]}
              activeOpacity={0.78}
              onPress={() => {
                setSelectedDay(day.key);
                const [year, month] = day.key.split("-").map(Number);
                if (month - 1 !== visibleMonth.getMonth() || year !== visibleMonth.getFullYear()) {
                  setVisibleMonth(new Date(year, month - 1, 1));
                }
              }}
            >
              <Text style={[
                styles.calendarDayText,
                !day.isCurrentMonth && styles.calendarDayTextMuted,
                selectedDay === day.key && styles.calendarDayTextActive,
              ]}>
                {day.day}
              </Text>
              {day.isToday ? <View style={[styles.calendarTodayDot, selectedDay === day.key && styles.calendarTodayDotActive]} /> : null}
              {day.count > 0 ? (
                <Text style={[
                  styles.calendarEventCount,
                  selectedDay === day.key && styles.calendarEventCountActive,
                ]}>
                  {day.count}项
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <ToggleRow
        title="同步到手机日历"
        detail={systemSync ? "已开启；关闭后不再写入新日程" : "仅在明确开启后写入系统日历，并保存系统事件 ID"}
        enabled={systemSync}
        disabled={syncingCalendar}
        onPress={() => {
          if (syncingCalendar) return;
          void (async () => {
            setSyncingCalendar(true);
            try {
              const next = !systemSync;
              if (next) {
                await calendarDriver.ensureWritableCalendar();
                for (const event of events.filter((item) => item.status === "pending")) {
                  const systemEventId = await syncCalendarEvent(calendarDriver, {
                    title: event.title,
                    privacyTitle: event.privacyTitle,
                    startAt: event.startAt,
                    endAt: event.endAt,
                  }, {
                    privacyTitleMode: privacyTitles,
                    existingSystemEventId: event.systemCalendarEventId,
                  });
                  await calendarService.updateEvent(event.id, {
                    syncToSystemCalendar: true,
                    systemCalendarEventId: systemEventId,
                  });
                }
              }
              await calendarService.updateSettings({ systemCalendarEnabled: next });
              setSystemSync(next);
              await load();
              onNotice(
                next ? "已开启系统日历同步" : "已关闭系统日历同步",
                next
                  ? "待办日程已写入系统日历；隐私标题模式会决定系统中显示的标题。"
                  : "后续不会继续写入系统日历；已存在于系统日历中的事件需在系统日历中管理。",
              );
            } catch (error) {
              onNotice("系统日历同步失败", error instanceof Error ? error.message : "请检查系统权限。");
            } finally {
              setSyncingCalendar(false);
            }
          })();
        }}
      />
      <ToggleRow
        title="隐私标题模式"
        detail="同步到手机日历和锁屏时隐藏姓名与档案信息"
        enabled={privacyTitles}
        disabled={savingPrivacyTitles}
        onPress={() => {
          if (savingPrivacyTitles) return;
          setSavingPrivacyTitles(true);
          void calendarService.updateSettings({
            privacyTitleModeEnabled: !privacyTitles,
          }).then((settings) => {
            setPrivacyTitles(settings.privacyTitleModeEnabled);
            onNotice(
              settings.privacyTitleModeEnabled ? "隐私标题模式已开启" : "隐私标题模式已关闭",
              settings.privacyTitleModeEnabled
                ? "同步到系统日历和锁屏时会隐藏姓名与档案信息。"
                : "系统日历和锁屏可能显示真实日程标题，请确认使用环境。",
            );
          }).catch((error) => {
            onNotice("设置更新失败", error instanceof Error ? error.message : "请稍后重试。");
          }).finally(() => setSavingPrivacyTitles(false));
        }}
      />
      <SectionHeader title={selectedDayLabel} action={`${scheduleRows.length} 项`} />
      <View style={styles.cardStack}>
        {scheduleRows.map((item) => (
          <View key={item.id} style={styles.listCard}>
            <View style={styles.timePill}><Text style={styles.timePillText}>{new Date(item.startAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</Text></View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{privacyTitles ? item.displayTitle : item.title}</Text>
              <Text style={styles.listMeta}>{categoryLabels[item.category] ?? item.category} · {item.sourceType === "profile_next_session" ? "档案自动同步" : "手动日程"}</Text>
            </View>
            {item.category === "counseling" ? (
              <TouchableOpacity style={styles.smallActionButton} onPress={onStartRecording}>
                <Mic size={15} color={colors.clayDark} />
                <Text style={styles.smallActionText}>录音</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {scheduleRows.length === 0 ? (
          <View style={styles.emptySearchCard}>
            <CalendarDays size={20} color={colors.subtle} />
            <Text style={styles.emptySearchTitle}>当天暂无安排</Text>
            <Text style={styles.emptySearchCopy}>在档案中设置下次时间后，后端会自动维护日程。</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SecuritySettingsScreen({
  initialSection,
  onNotice,
  onDeleteAccount,
}: {
  initialSection: SecuritySection;
  onNotice: (title: string, detail: string) => void;
  onDeleteAccount: (password: string) => Promise<void>;
}) {
  const [activeSection, setActiveSection] = useState<SecuritySection>(initialSection);
  const [calendarSync, setCalendarSync] = useState(false);
  const [privacyTitle, setPrivacyTitle] = useState(true);
  const [savingCalendarSetting, setSavingCalendarSetting] = useState(false);
  const [savingPrivacyTitleSetting, setSavingPrivacyTitleSetting] = useState(false);
  const [grantMinutes, setGrantMinutes] = useState(60);
  const [grantOptions, setGrantOptions] = useState([30, 60, 120]);
  const [savingGrantMinutes, setSavingGrantMinutes] = useState(false);
  const [passwords, setPasswords] = useState<Record<ArchiveKind, boolean>>({
    client: false,
    supervisor: false,
    supervisee: false,
  });
  const [editingPassword, setEditingPassword] = useState<ArchiveKind | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingAccessPassword, setSavingAccessPassword] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [dangerOpen, setDangerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    void Promise.all([
      profileAccessService.statuses(),
      calendarService.settings(),
    ]).then(([statuses, settings]) => {
      setPasswords({
        client: statuses.items.find((item) => item.profile_type === "client")?.is_set ?? false,
        supervisor: statuses.items.find((item) => item.profile_type === "supervisor")?.is_set ?? false,
        supervisee: statuses.items.find((item) => item.profile_type === "supervisee")?.is_set ?? false,
      });
      setGrantMinutes(statuses.grantMinutes);
      setGrantOptions(statuses.grantOptions);
      setCalendarSync(settings.systemCalendarEnabled);
      setPrivacyTitle(settings.privacyTitleModeEnabled);
    }).catch((error) => {
      onNotice("安全设置加载失败", error instanceof Error ? error.message : "请稍后重试。");
    });
  }, []);

  return (
    <View style={styles.stack}>
      <View style={styles.securityTabs}>
        {([
          ["profileAccess", "档案密码"],
          ["calendar", "日历同步"],
          ["account", "账号安全"],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.securityTab,
              activeSection === key && styles.securityTabActive,
            ]}
            activeOpacity={0.78}
            onPress={() => setActiveSection(key)}
          >
            <Text style={[
              styles.securityTabText,
              activeSection === key && styles.securityTabTextActive,
            ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeSection === "profileAccess" ? (
        <>
          <SectionHeader title="档案访问密码" />
          <View style={styles.settingsList}>
            {([
              ["client", "来访者档案"],
              ["supervisor", "督导师档案"],
              ["supervisee", "受督者档案"],
            ] as const).map(([key, label]) => (
              <SettingsRow
                key={key}
                icon={LockKeyhole}
                title={label}
                value={passwords[key] ? "已设置" : "未设置"}
                onPress={() => {
                  if (savingAccessPassword) return;
                  setEditingPassword(key);
                  setNewPassword("");
                }}
              />
            ))}
          </View>
          {editingPassword ? (
            <View style={styles.inlineCreateCard}>
              <Text style={styles.formPreviewTitle}>设置新的档案访问密码</Text>
              <TextInput
                value={newPassword}
                onChangeText={(value) => setNewPassword(normalizeAccessPinInput(value))}
                placeholder="6 位数字密码"
                placeholderTextColor={colors.subtle}
                style={styles.archiveTextInput}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
              />
              <TouchableOpacity
                style={[
                  styles.inlineCreateConfirm,
                  (!isCompleteAccessPin(newPassword) || savingAccessPassword) && styles.inlineCreateConfirmDisabled,
                ]}
                disabled={!isCompleteAccessPin(newPassword) || savingAccessPassword}
                onPress={() => {
                  const profileType = editingPassword;
                  setSavingAccessPassword(true);
                  void profileAccessService.setPassword(profileType, newPassword)
                    .then(() => {
                      setPasswords((current) => ({ ...current, [profileType]: true }));
                      setEditingPassword(null);
                      setNewPassword("");
                      onNotice("访问密码已更新", "旧的档案访问授权已撤销，下次进入需要重新验证。");
                    })
                    .catch((error) => onNotice("密码更新失败", error instanceof Error ? error.message : "请稍后重试。"))
                    .finally(() => setSavingAccessPassword(false));
                }}
              >
                <Text style={styles.inlineCreateConfirmText}>
                  {savingAccessPassword ? "正在保存..." : "保存访问密码"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <SectionHeader title="免密有效期" action={`${grantMinutes} 分钟`} />
          <View style={styles.inlineCreateCard}>
            <Text style={styles.formHelp}>验证某类档案密码后，同类型档案在有效期内无需重复输入。</Text>
            <View style={styles.choiceGroup}>
              {grantOptions.map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  style={[
                    styles.choicePill,
                    grantMinutes === minutes && styles.choicePillActive,
                    savingGrantMinutes && styles.smallActionDisabled,
                  ]}
                  activeOpacity={0.78}
                  disabled={savingGrantMinutes || grantMinutes === minutes}
                  onPress={() => {
                    if (savingGrantMinutes || grantMinutes === minutes) return;
                    setSavingGrantMinutes(true);
                    void profileAccessService.updateSettings({ grantMinutes: minutes })
                      .then((settings) => {
                        setGrantMinutes(settings.grantMinutes);
                        setGrantOptions(settings.grantOptions);
                        profileAccessService.clearGrants();
                        onNotice("免密有效期已更新", `之后验证档案密码，将在 ${settings.grantMinutes} 分钟内免重复输入。`);
                      })
                      .catch((error) => onNotice("有效期保存失败", error instanceof Error ? error.message : "请稍后重试。"))
                      .finally(() => setSavingGrantMinutes(false));
                  }}
                >
                  <Text style={[
                    styles.choicePillText,
                    grantMinutes === minutes && styles.choicePillTextActive,
                  ]}>
                    {minutes} 分钟
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {activeSection === "calendar" ? (
        <>
          <SectionHeader title="日历与登录" />
          <View style={styles.settingsList}>
            <ToggleRow
              title="手机日历同步"
              detail={calendarSync ? "已开启；关闭后不再写入新日程" : "把 App 日程同步到系统日历"}
              enabled={calendarSync}
              disabled={savingCalendarSetting}
              onPress={() => {
                if (savingCalendarSetting) return;
                const next = !calendarSync;
                setSavingCalendarSetting(true);
                void calendarService.updateSettings({ systemCalendarEnabled: next })
                  .then(() => {
                    setCalendarSync(next);
                    onNotice(
                      next ? "手机日历同步已开启" : "手机日历同步已关闭",
                      next
                        ? "后续日程可写入系统日历。隐私标题模式会影响系统中显示的标题。"
                        : "后续不会继续写入系统日历；已存在的系统日历事件需在系统日历中管理。",
                    );
                  })
                  .catch((error) => onNotice("设置保存失败", error instanceof Error ? error.message : "请稍后重试。"))
                  .finally(() => setSavingCalendarSetting(false));
              }}
            />
            <ToggleRow
              title="隐私标题模式"
              detail="系统日历与锁屏仅显示“个人安排”"
              enabled={privacyTitle}
              disabled={savingPrivacyTitleSetting}
              onPress={() => {
                if (savingPrivacyTitleSetting) return;
                const next = !privacyTitle;
                setSavingPrivacyTitleSetting(true);
                void calendarService.updateSettings({ privacyTitleModeEnabled: next })
                  .then(() => {
                    setPrivacyTitle(next);
                    onNotice(
                      next ? "隐私标题模式已开启" : "隐私标题模式已关闭",
                      next
                        ? "系统日历与锁屏会隐藏姓名与档案信息。"
                        : "系统日历与锁屏可能显示真实日程标题，请确认使用环境。",
                    );
                  })
                  .catch((error) => onNotice("设置保存失败", error instanceof Error ? error.message : "请稍后重试。"))
                  .finally(() => setSavingPrivacyTitleSetting(false));
              }}
            />
          </View>
        </>
      ) : null}

      {activeSection === "account" ? (
        <>
          <SectionHeader title="账号安全" />
          <View style={styles.settingsList}>
            <SettingsRow icon={ShieldCheck} title="登录会话" value="自动刷新并安全存储" onPress={() => onNotice("登录会话", "访问令牌过期后会通过一次性刷新令牌自动续期；退出登录会清除本机令牌。")} />
          </View>
          <SectionHeader title="账号与资料" />
          <View style={styles.settingsList}>
            <SettingsRow
              icon={Trash2}
              title="永久注销账号"
              value={dangerOpen ? "正在确认" : "展开后操作"}
              onPress={() => {
                setDangerOpen((current) => {
                  const next = !current;
                  if (!next) {
                    setAccountPassword("");
                    setDeleteConfirmation("");
                  }
                  return next;
                });
              }}
            />
          </View>
          {dangerOpen ? (
            <View style={styles.dangerCard}>
              <Text style={styles.dangerTitle}>确认永久注销</Text>
              <Text style={styles.dangerCopy}>此操作会删除档案、记录、报告、附件和云端对象，且不可恢复。请先确认本机已不再需要这些资料。</Text>
              <TextInput
                value={accountPassword}
                onChangeText={setAccountPassword}
                placeholder="账号登录密码"
                placeholderTextColor={colors.subtle}
                style={styles.archiveTextInput}
                secureTextEntry
              />
              <TextInput
                value={deleteConfirmation}
                onChangeText={setDeleteConfirmation}
                placeholder="输入确认词：注销账号"
                placeholderTextColor={colors.subtle}
                style={styles.archiveTextInput}
              />
              <View style={styles.dangerActions}>
                <TouchableOpacity
                  style={styles.dangerCancelButton}
                  activeOpacity={0.78}
                  disabled={deleting}
                  onPress={() => {
                    setDangerOpen(false);
                    setAccountPassword("");
                    setDeleteConfirmation("");
                  }}
                >
                  <Text style={styles.dangerCancelButtonText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.dangerButton,
                    styles.dangerConfirmButton,
                    (deleting || accountPassword.length < 8 || deleteConfirmation !== "注销账号")
                      && styles.dangerButtonDisabled,
                  ]}
                  activeOpacity={0.78}
                  disabled={deleting || accountPassword.length < 8 || deleteConfirmation !== "注销账号"}
                  onPress={() => {
                    setDeleting(true);
                    void onDeleteAccount(accountPassword)
                      .catch((error) => {
                        onNotice("账号注销失败", error instanceof Error ? error.message : "请核对密码后重试。");
                        setDeleting(false);
                      });
                  }}
                >
                  <Trash2 size={16} color={colors.danger} />
                  <Text style={styles.dangerButtonText}>{deleting ? "正在删除..." : "确认注销"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function ToggleRow({
  title,
  detail,
  enabled,
  disabled,
  onPress,
}: {
  title: string;
  detail: string;
  enabled: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}
      activeOpacity={0.78}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{detail}</Text>
      </View>
      <View style={[styles.toggleTrack, enabled && styles.toggleTrackEnabled]}>
        <View style={[styles.toggleThumb, enabled && styles.toggleThumbEnabled]} />
      </View>
    </TouchableOpacity>
  );
}

function BottomTabs({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.key;
        return (
          <TouchableOpacity key={tab.key} style={styles.tabItem} activeOpacity={0.75} onPress={() => onChange(tab.key)}>
            <Icon size={20} color={isActive ? colors.clayDark : colors.subtle} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <TouchableOpacity activeOpacity={0.75} onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : action ? (
        <Text style={styles.sectionActionStatic}>{action}</Text>
      ) : null}
    </View>
  );
}

function PrimaryButton({
  icon: Icon,
  label,
  onPress,
  wide,
  disabled,
}: {
  icon: typeof Mic;
  label: string;
  onPress: () => void;
  wide?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.primaryButton,
        wide && styles.wideButton,
        disabled && styles.pendingPrimaryButton,
      ]}
      activeOpacity={0.78}
      disabled={disabled}
      onPress={onPress}
    >
      <Icon size={18} color="#FFF9F3" />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function GhostButton({ icon: Icon, label, onPress }: { icon: typeof Sparkles; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.ghostButton} activeOpacity={0.78} onPress={onPress}>
      <Icon size={17} color={colors.clayDark} />
      <Text style={styles.ghostButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function QuickAction({ icon: Icon, label, detail, onPress }: { icon: typeof Mic; label: string; detail: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} activeOpacity={0.78} onPress={onPress}>
      <Icon size={21} color={colors.clayDark} />
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickDetail}>{detail}</Text>
    </TouchableOpacity>
  );
}

function ReportGenerationScreen({
  pending,
  busy,
  onCancel,
  onConfirm,
  onRetry,
}: {
  pending: PendingReportGeneration;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  const groups = reportSourceGroups(pending.sources);
  const title = pending.mode === "create"
    ? `生成${pending.recordType}草稿`
    : `重新生成${pending.recordType}草稿`;
  const hasSources = pending.sources.length > 0;
  if (pending.loading) {
    return (
      <View style={styles.stack}>
        <View style={styles.emptySearchCard}>
          <Clock3 size={20} color={colors.subtle} />
          <Text style={styles.emptySearchTitle}>正在读取可用资料</Text>
          <Text style={styles.emptySearchCopy}>正在确认本次历程可用于生成的录音、纪要、量表与作业。</Text>
        </View>
      </View>
    );
  }
  if (pending.loadError) {
    return (
      <View style={styles.stack}>
        <View style={styles.emptySearchCard}>
          <CircleAlert size={20} color={colors.danger} />
          <Text style={styles.emptySearchTitle}>资料读取失败</Text>
          <Text style={styles.emptySearchCopy}>{pending.loadError}</Text>
          <Text style={styles.emptySearchCopy}>页面已保留，你可以检查网络或档案访问状态后重试。</Text>
        </View>
        <PrimaryButton icon={RefreshCcw} label="重新读取资料" onPress={onRetry} wide />
        <GhostButton icon={X} label="返回本次历程" onPress={onCancel} />
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      <View style={styles.noticeCard}>
        <FileText size={23} color={colors.clayDark} />
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>{title}</Text>
          <Text style={styles.listMeta}>
            {pending.mode === "regenerate"
              ? "将覆盖当前草稿；已保存的正式版不会被覆盖。"
              : "生成后可在编辑页修改并保存为正式版。"}
          </Text>
        </View>
      </View>

      {hasSources ? (
        <>
          <SectionHeader title="将依据以下资料" action={`${pending.sources.length} 项`} />
          <Text style={styles.confirmMeta}>资料类型：{groups.join("、")}</Text>
          <View style={styles.cardStack}>
            {pending.sources.map((source) => (
              <View key={`${source.resourceType}:${source.resourceId}`} style={styles.recordingCard}>
                <View style={styles.recordingIcon}>
                  <FileText size={20} color={colors.clayDark} />
                </View>
                <View style={styles.listBody}>
                  <Text style={styles.listTitle}>{truncateMiddle(source.label)}</Text>
                </View>
              </View>
            ))}
          </View>
          <PrimaryButton
            icon={Sparkles}
            label={busy ? "正在生成..." : "确认生成"}
            onPress={onConfirm}
            wide
            disabled={busy}
          />
        </>
      ) : (
        <View style={styles.emptySearchCard}>
          <CircleAlert size={20} color={colors.danger} />
          <Text style={styles.emptySearchTitle}>暂无可用资料</Text>
          <Text style={styles.emptySearchCopy}>
            生成{pending.recordType}需要录音转写、纪要、量表、作业等资料。请先在本次历程中归档录音或上传资料，再回来生成。
          </Text>
        </View>
      )}

      <GhostButton icon={X} label={hasSources ? "取消" : "返回"} onPress={onCancel} />
    </View>
  );
}

function ActionNotice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4500);
    return () => clearTimeout(timer);
  }, [notice.title, notice.detail, onClose]);
  // Android 兼容红线：提示层必须用官方 <Modal>，不能用 absolute 自绘覆盖层
  // （Android 上不置顶、完全不可见——曾导致多轮「提示隐形」误判）。
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <TouchableOpacity style={styles.noticeToastBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.noticeToast}>
          <CheckCircle2 size={19} color={colors.sageDark} />
          <View style={styles.listBody}>
            <Text style={styles.noticeToastTitle}>{notice.title}</Text>
            <Text style={styles.noticeToastDetail}>{notice.detail}</Text>
          </View>
          <TouchableOpacity style={styles.noticeToastClose} activeOpacity={0.75} onPress={onClose}>
            <X size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function Badge({ label, tone }: { label: string; tone: "warm" | "green" | "blue" }) {
  return <Text style={[styles.badge, styles[`badge_${tone}`]]}>{label}</Text>;
}

function ChatBubble({ align, text }: { align: "left" | "right"; text: string }) {
  return (
    <View style={[styles.chatBubble, align === "right" && styles.chatBubbleRight]}>
      <Text style={[styles.chatText, align === "right" && styles.chatTextRight]}>{text}</Text>
    </View>
  );
}

function ArticleRow({ title, tag, onPress }: { title: string; tag: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.articleRow} activeOpacity={0.78} onPress={onPress}>
      <Badge label={tag} tone="blue" />
      <Text style={styles.articleTitle}>{title}</Text>
      <ChevronRight size={18} color={colors.subtle} />
    </TouchableOpacity>
  );
}

function SettingsRow({ icon: Icon, title, value, onPress }: { icon: typeof LockKeyhole; title: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.settingsRow} activeOpacity={0.78} onPress={onPress}>
      <Icon size={19} color={colors.clayDark} />
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{value}</Text>
      </View>
    </TouchableOpacity>
  );
}

function IdentityOption({ active, title, detail, onPress }: { active: boolean; title: string; detail: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.identityOption, active && styles.identityOptionActive]} activeOpacity={0.78} onPress={onPress}>
      <Text style={[styles.identityTitle, active && styles.identityTitleActive]}>{title}</Text>
      <Text style={styles.identityDetail}>{detail}</Text>
    </TouchableOpacity>
  );
}

function LegalFile({ title, meta, icon: Icon, onPress }: { title: string; meta: string; icon: typeof FileText; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.legalFile} activeOpacity={0.78} onPress={onPress}>
      <View style={styles.legalIcon}>
        <Icon size={19} color={colors.clayDark} />
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{meta}</Text>
      </View>
    </TouchableOpacity>
  );
}

function MissingSessionCard({
  sequence,
  sessionNoun,
}: {
  sequence: number;
  sessionNoun: string;
}) {
  return (
    <View style={[styles.sessionCard, styles.missingSessionCard]}>
      <View style={styles.sessionTop}>
        <View style={styles.listBody}>
          <View style={styles.sessionTitleRow}>
            <Text style={[styles.sessionIndex, styles.missingSessionIndex]}>第 {sequence} 次</Text>
            <Text style={styles.sessionTime}>记录已删除/未保留</Text>
          </View>
          <Text style={styles.sessionSummary}>
            这次{sessionNoun}的编号被保留，用于维持完整历程顺序；原始内容、附件和记录不在当前档案中展示。
          </Text>
        </View>
      </View>
      <View style={styles.sessionFooter}>
        <Text style={styles.sessionRule}>占位说明不会参与记录生成、报告生成或资料授权</Text>
      </View>
    </View>
  );
}

function SessionCard({
  session,
  sessionNoun,
  recordType,
  onChange,
  onDelete,
  onOpenRecord,
  onOpenMaterial,
  onNotice,
}: {
  session: SessionHistoryItem;
  sessionNoun: string;
  recordType: string;
  onChange: (patch: Partial<Omit<SessionHistoryItem, "id">>) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpenRecord: () => void;
  onOpenMaterial: (category: MaterialCategory) => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [timeDraft, setTimeDraft] = useState(() => formatDateTimeInput(session.occurredAt));
  const [summaryDraft, setSummaryDraft] = useState(session.summary);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const recordPending = session.record === "未生成" || session.record === "待生成";
  const recordActionLabel = recordPending
    ? `生成${recordType}`
    : session.record === "正式版"
      ? `查看${recordType}`
      : `查看/编辑${recordType}`;
  const saveEdit = async () => {
    if (savingEdit) return;
    const occurredAt = normalizeSessionDate(timeDraft);
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
      onNotice("日期时间格式不正确", "请重新选择记录时间。");
      return;
    }
    setSavingEdit(true);
    try {
      await onChange({ occurredAt, summary: summaryDraft.trim() || session.summary });
      setEditing(false);
      onNotice("记录摘要已更新", "咨询历程已按时间倒序重新排列。");
    } catch {
      // Parent already showed the specific update failure.
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionTop}>
        <View style={styles.listBody}>
          <View style={styles.sessionTitleRow}>
            <Text style={styles.sessionIndex}>第 {session.sequence} 次</Text>
            <Text style={styles.sessionTime}>{formatSessionTime(session.occurredAt)}</Text>
          </View>
          <Text style={styles.sessionSummary}>{session.summary}</Text>
        </View>
        <View style={styles.sessionTags}>
          {session.tags.map((tag) => (
            <Text key={tag} style={styles.sessionTag}>{tag}</Text>
          ))}
        </View>
      </View>

      <View style={styles.sessionCardTools}>
        <TouchableOpacity
          style={[
            styles.sessionToolButton,
            (savingEdit || deletingSession) && styles.smallActionDisabled,
          ]}
          activeOpacity={0.78}
          disabled={savingEdit || deletingSession}
          onPress={() => {
          setEditing((current) => !current);
          setConfirmDelete(false);
        }}>
          <Edit3 size={14} color={colors.clayDark} />
          <Text style={styles.sessionToolText}>{editing ? "收起编辑" : "编辑摘要"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sessionToolButton,
            confirmDelete && styles.sessionToolButtonDanger,
            deletingSession && styles.smallActionDisabled,
          ]}
          activeOpacity={0.78}
          disabled={deletingSession}
          onPress={() => {
          if (!confirmDelete) {
            setConfirmDelete(true);
            return;
          }
          setDeletingSession(true);
          void onDelete().catch(() => {
            setDeletingSession(false);
          });
        }}>
          <Trash2 size={14} color={confirmDelete ? colors.danger : colors.clayDark} />
          <Text style={[styles.sessionToolText, confirmDelete && styles.sessionToolTextDanger]}>
            {deletingSession ? "正在删除..." : confirmDelete ? "确认删除" : "删除"}
          </Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        <View style={styles.sessionEditPanel}>
          <DateTimePickerField
            value={timeDraft}
            onChange={setTimeDraft}
            placeholder="选择咨询时间"
            defaultOpen
          />
          <TextInput
            value={summaryDraft}
            onChangeText={setSummaryDraft}
            multiline
            style={[styles.archiveTextInput, styles.archiveTextArea]}
          />
          <View style={styles.tagEditRow}>
            {session.tags.map((tag) => (
              <TouchableOpacity key={tag} style={styles.editableTag} activeOpacity={0.78} onPress={() => void onChange({ tags: session.tags.filter((item) => item !== tag) })}>
                <Text style={styles.editableTagText}>{tag} ×</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.tagAddRow}>
            <TextInput
              value={tagDraft}
              onChangeText={setTagDraft}
              placeholder={session.tags.length >= 4 ? "最多 4 个标签" : "添加标签"}
              placeholderTextColor={colors.subtle}
              style={[styles.archiveTextInput, styles.flexInput]}
              editable={session.tags.length < 4}
            />
            <TouchableOpacity style={[styles.smallActionButton, session.tags.length >= 4 && styles.smallActionDisabled]} activeOpacity={0.78} onPress={() => {
              const nextTags = addSessionTag(session.tags, tagDraft);
              if (nextTags === session.tags) {
                onNotice("标签未添加", session.tags.length >= 4 ? "每次记录最多保留 4 个标签。" : "标签不能为空或重复。");
                return;
              }
              void onChange({ tags: nextTags });
              setTagDraft("");
            }}>
              <Plus size={15} color={colors.clayDark} />
              <Text style={styles.smallActionText}>添加</Text>
            </TouchableOpacity>
          </View>
          <PrimaryButton icon={Save} label={savingEdit ? "正在保存..." : "保存摘要与标签"} onPress={() => void saveEdit()} wide disabled={savingEdit} />
        </View>
      ) : null}

      <View style={styles.sessionActionGrid}>
        <SessionAction icon={Mic} label="录音" status={session.recording} tone={session.recording.includes("剩余") ? "warm" : "muted"} onPress={() => onOpenMaterial("recording")} />
        <SessionAction icon={ChartNoAxesColumn} label="量表" status={session.scale} tone={session.scale === "未上传" ? "muted" : "green"} onPress={() => onOpenMaterial("scale")} />
        <SessionAction icon={ClipboardList} label="作业" status={session.homework} tone={session.homework.includes("已") ? "green" : "muted"} onPress={() => onOpenMaterial("homework")} />
        <SessionAction icon={Plus} label="其他" status={session.other} tone={session.other === "无" ? "muted" : "blue"} onPress={() => onOpenMaterial("other")} />
      </View>

      <View style={styles.sessionFooter}>
        <Text style={styles.sessionRule}>记录可存草稿/正式版；敏感资料需主动授权长期保存</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.sessionGenerateButton}
          onPress={onOpenRecord}
        >
          {recordPending ? <FileText size={16} color={colors.clayDark} /> : <Eye size={16} color={colors.clayDark} />}
          <Text style={styles.sessionGenerateText}>{recordActionLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SessionAction({ icon: Icon, label, status, tone, onPress }: { icon: typeof Mic; label: string; status: string; tone: "warm" | "green" | "blue" | "muted"; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.sessionAction} activeOpacity={0.78} onPress={onPress}>
      <View style={[styles.sessionActionIcon, styles[`sessionActionIcon_${tone}`]]}>
        <Icon size={18} color={tone === "muted" ? colors.subtle : colors.clayDark} />
      </View>
      <Text style={styles.sessionActionLabel}>{label}</Text>
      <Text style={styles.sessionActionStatus}>{status}</Text>
    </TouchableOpacity>
  );
}

function formatDateTimeDisplay(value: string): string {
  const date = dateFromDateTimeInput(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "short" });
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getFullYear()}年${month}月${day}日 ${weekday} ${hour}:${minute}`;
}

function DateTimePickerField({
  value,
  onChange,
  defaultOpen = false,
  placeholder = "选择日期时间",
}: {
  value: string;
  onChange: (value: string) => void;
  defaultOpen?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const selected = dateFromDateTimeInput(value) ?? new Date();
  const display = value ? formatDateTimeDisplay(value) : "";
  const commit = (date: Date) => {
    date.setSeconds(0, 0);
    onChange(formatDateTimeInput(date));
  };
  const handleNativeDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type !== "set" || !date) return;
    const next = new Date(selected);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    commit(next);
  };
  const handleNativeTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type !== "set" || !date) return;
    const next = new Date(selected);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    commit(next);
  };
  const commitDatePart = (date: Date) => {
    const next = new Date(selected);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    commit(next);
  };
  const commitTimePart = (date: Date) => {
    const next = new Date(selected);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    commit(next);
  };
  const openAndroidPicker = (mode: "date" | "time") => {
    DateTimePickerAndroid.open({
      value: selected,
      mode,
      display: mode === "date" ? "calendar" : "clock",
      is24Hour: true,
      positiveButton: { label: "确定", textColor: colors.clayDark },
      negativeButton: { label: "取消" },
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        if (mode === "date") commitDatePart(date);
        if (mode === "time") commitTimePart(date);
      },
    });
  };

  return (
    <View style={styles.datePicker}>
      <TouchableOpacity style={styles.datePickerTrigger} activeOpacity={0.78} onPress={() => setOpen((current) => !current)}>
        <CalendarDays size={17} color={display ? colors.clayDark : colors.subtle} />
        <Text style={[styles.datePickerTriggerText, !display && styles.datePickerPlaceholder]}>
          {display || placeholder}
        </Text>
        <Text style={styles.datePickerActionText}>{open ? "收起" : display ? "修改" : "选择时间"}</Text>
      </TouchableOpacity>
      {Platform.OS === "ios" ? (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <TouchableWithoutFeedback onPress={() => setOpen(false)}>
            <View style={styles.datePickerBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.datePickerSheet}>
                  <View style={styles.datePickerSheetHeader}>
                    <Text style={styles.datePickerSheetTitle}>{placeholder || "选择日期时间"}</Text>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen(false)}>
                      <Text style={styles.datePickerSheetDone}>完成</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.datePickerIOSSpinners}>
                    <NativeDateTimePicker
                      value={selected}
                      mode="date"
                      display="spinner"
                      locale="zh-Hans-CN"
                      accentColor={colors.clayDark}
                      themeVariant="light"
                      onChange={handleNativeDateChange}
                      style={styles.datePickerIOSSpinnerDate}
                    />
                    <View style={styles.datePickerIOSSpinnerDivider} />
                    <NativeDateTimePicker
                      value={selected}
                      mode="time"
                      display="spinner"
                      locale="zh-Hans-CN"
                      accentColor={colors.clayDark}
                      themeVariant="light"
                      onChange={handleNativeTimeChange}
                      style={styles.datePickerIOSSpinnerTime}
                    />
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      ) : open ? (
        <View style={styles.datePickerPanel}>
          {Platform.OS === "android" ? (
            <View style={styles.datePickerAndroidActions}>
              <TouchableOpacity style={styles.datePickerNativeButton} activeOpacity={0.78} onPress={() => openAndroidPicker("date")}>
                <Text style={styles.datePickerNativeButtonText}>选择日期</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.datePickerNativeButton} activeOpacity={0.78} onPress={() => openAndroidPicker("time")}>
                <Text style={styles.datePickerNativeButtonText}>选择时间</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebDatePicker
              value={selected}
              onChange={(date: Date) => {
                commit(date);
                setOpen(false);
              }}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

function MiniStat({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.miniStat} {...(onPress ? { activeOpacity: 0.78, onPress } : {})}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </Wrapper>
  );
}

function NextSessionStat({
  label,
  next,
  nextAt,
  onPress,
}: {
  label: string;
  next: string;
  nextAt?: string | null;
  onPress: () => void;
}) {
  const date = nextAt ? dateFromDateTimeInput(nextAt) : null;
  const isUnset = !date || Number.isNaN(date.getTime()) || next.includes("未设置");
  const isExpired = next.startsWith("已过期");
  if (isUnset) {
    return (
      <TouchableOpacity style={styles.nextSessionStat} activeOpacity={0.78} onPress={onPress}>
        <View style={styles.nextSessionIcon}>
          <CalendarDays size={20} color={colors.clayDark} />
        </View>
        <View style={styles.nextSessionBody}>
          <Text style={styles.nextSessionEmpty}>未设置下次{label === "安排" ? "安排" : "咨询"}</Text>
          <Text style={styles.nextSessionHint}>点击设置时间</Text>
        </View>
        <ChevronRight size={18} color={colors.subtle} />
      </TouchableOpacity>
    );
  }
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "short" });
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return (
    <TouchableOpacity style={styles.nextSessionStat} activeOpacity={0.78} onPress={onPress}>
      <View style={[styles.nextSessionIcon, isExpired && { backgroundColor: "rgba(196, 93, 84, 0.12)" }]}>
        <CalendarDays size={20} color={isExpired ? colors.danger : colors.clayDark} />
      </View>
      <View style={styles.nextSessionBody}>
        <View style={styles.nextSessionTop}>
          <Text style={[styles.nextSessionDate, isExpired && { color: colors.danger }]}>
            {month}月{day}日 {weekday}
          </Text>
          {isExpired ? (
            <View style={styles.nextSessionExpiredBadge}>
              <Text style={styles.nextSessionExpiredBadgeText}>已过期</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.nextSessionTime}>{hour}:{minute}</Text>
      </View>
      <ChevronRight size={18} color={colors.subtle} />
    </TouchableOpacity>
  );
}

function ProcessingRow({ title, detail, status, complete, failed }: { title: string; detail: string; status: string; complete?: boolean; failed?: boolean }) {
  return (
    <View style={styles.processingRow}>
      <View style={[styles.processingDot, complete && styles.processingDotComplete]}>
        {complete ? <CheckCircle2 size={15} color="#FFF9F3" /> : failed ? <CircleAlert size={14} color={colors.danger} /> : <Clock3 size={14} color={colors.clayDark} />}
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{detail}</Text>
      </View>
      <Badge label={status} tone={complete ? "green" : failed ? "warm" : "blue"} />
    </View>
  );
}

function DataRow({ icon: Icon, title, value, onPress }: { icon: typeof FileText; title: string; value: string; onPress?: () => void }) {
  const content = (
    <>
      <Icon size={18} color={colors.clayDark} />
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{value}</Text>
      </View>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={styles.dataRow} activeOpacity={0.78} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.dataRow}>
      {content}
    </View>
  );
}

function ChapterRow({ time, title, current }: { time: string; title: string; current?: boolean }) {
  return (
    <View style={[styles.chapterRow, current && styles.chapterRowCurrent]}>
      <Text style={styles.chapterTime}>{time}</Text>
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{current ? "当前定位章节" : "点击可跳转到对应转写"}</Text>
      </View>
      {current ? <Badge label="当前" tone="blue" /> : null}
    </View>
  );
}

function ConsentItem({ title, meta, selected, onPress }: { title: string; meta: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.consentItem, selected && styles.consentItemSelected]} activeOpacity={0.78} onPress={onPress}>
      <View style={[styles.emptyCheckbox, selected && styles.selectedCheckbox]}>
        {selected ? <CheckCircle2 size={14} color="#FFF9F3" /> : null}
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{meta}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 0 : 0,
  },
  authLoading: {
    width: "100%",
    maxWidth: 430,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  authLoadingText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  errorCard: {
    marginTop: 64,
    marginHorizontal: 20,
    padding: 22,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 14,
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  errorCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  errorStack: {
    color: colors.subtle,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" }),
  },
  authShell: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 36,
    gap: 22,
  },
  authBrand: {
    gap: 8,
  },
  authBrandIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  authTitle: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
  },
  authCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  authCard: {
    borderRadius: radius.sm,
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
    ...shadow.soft,
  },
  authError: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  authSwitch: {
    color: colors.clayDark,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 4,
  },
  authFootnote: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  phoneShell: {
    width: "100%",
    maxWidth: 430,
    flex: 1,
    backgroundColor: colors.paper,
  },
  phoneShellCompact: {
    maxWidth: "100%",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kicker: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
  },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  textButton: {
    minWidth: 58,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonLabel: {
    color: colors.clayDark,
    fontSize: 14,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  stack: {
    gap: 16,
  },
  hero: {
    borderRadius: radius.sm,
    padding: 18,
    backgroundColor: colors.clay,
    ...shadow.soft,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLabel: {
    color: "rgba(255,249,243,0.82)",
    fontSize: 13,
    fontWeight: "700",
  },
  heroTitle: {
    color: "#FFF9F3",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
  },
  heroCopy: {
    marginTop: 12,
    color: "rgba(255,249,243,0.86)",
    fontSize: 14,
    lineHeight: 21,
  },
  heroActions: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    minHeight: 46,
    paddingHorizontal: 15,
    borderRadius: radius.sm,
    backgroundColor: colors.clayDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  wideButton: {
    width: "100%",
  },
  primaryButtonText: {
    color: "#FFF9F3",
    fontSize: 14,
    fontWeight: "700",
  },
  ghostButton: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ghostButtonText: {
    color: colors.clayDark,
    fontSize: 14,
    fontWeight: "700",
  },
  quickGrid: {
    flexDirection: "row",
    gap: 12,
  },
  quickAction: {
    ...shadow.card,
    flex: 1,
    minHeight: 104,
    borderRadius: radius.lg,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "space-between",
  },
  quickLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  quickDetail: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  sectionHeader: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  sectionAction: {
    color: colors.clayDark,
    fontSize: 13,
    fontWeight: "700",
  },
  sectionActionStatic: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    ...shadow.card,
    flex: 1,
    minHeight: 78,
    borderRadius: radius.lg,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "700",
  },
  metricLabel: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  cardStack: {
    gap: 14,
  },
  listCard: {
    ...shadow.card,
    minHeight: 72,
    borderRadius: radius.lg,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timePill: {
    width: 54,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  timePillText: {
    color: colors.clayDark,
    fontSize: 13,
    fontWeight: "700",
  },
  listBody: {
    flex: 1,
    gap: 3,
  },
  listTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  listMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  recorderPanel: {
    borderRadius: radius.sm,
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    gap: 18,
  },
  recorderRing: {
    width: 214,
    height: 214,
    borderRadius: 107,
    borderWidth: 16,
    borderColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7EF",
  },
  recorderDot: {
    width: 11,
    height: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.clay,
    marginBottom: 10,
  },
  recorderTime: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "700",
  },
  recorderState: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  controlRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cancelButton: {
    width: 86,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: colors.muted,
    fontWeight: "700",
  },
  cancelButtonDanger: {
    backgroundColor: "#F7E2DF",
    borderWidth: 1,
    borderColor: "#E5B4AE",
  },
  cancelButtonTextDanger: {
    color: colors.danger,
  },
  warningPanel: {
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: "#FFF3F1",
    borderWidth: 1,
    borderColor: "#E8C1BC",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  warningText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  pauseButton: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.clay,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseButtonDisabled: {
    opacity: 0.55,
  },
  saveButton: {
    width: 86,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: "#FFF9F3",
    fontWeight: "700",
  },
  recordingCard: {
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    gap: 12,
  },
  recordingIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: "#F2D9CD",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 5,
  },
  badge: {
    overflow: "hidden",
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "700",
  },
  badge_warm: {
    color: colors.clayDark,
    backgroundColor: "#F5DED5",
  },
  badge_green: {
    color: colors.sageDark,
    backgroundColor: "#E4EFE9",
  },
  badge_blue: {
    color: "#536F90",
    backgroundColor: "#E7EEF5",
  },
  noticeCard: {
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: "#EEF5F0",
    borderWidth: 1,
    borderColor: "#D8E6DD",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  archiveKindGrid: {
    flexDirection: "row",
    gap: 8,
  },
  archiveKindOption: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.sm,
    padding: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
  },
  archiveKindOptionActive: {
    backgroundColor: "#F7EDE4",
    borderColor: "#E7B9A8",
  },
  archiveKindTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  archiveKindTitleActive: {
    color: colors.clayDark,
  },
  archiveKindDetail: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  archiveProfileCard: {
    minHeight: 70,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  archiveProfileCardSelected: {
    backgroundColor: "#EEF5F0",
    borderColor: "#C9DED1",
  },
  emptySearchCard: {
    minHeight: 108,
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  emptySearchTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  emptySearchCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    fontWeight: "700",
  },
  createInlineButton: {
    minHeight: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createInlineButtonText: {
    color: colors.clayDark,
    fontSize: 14,
    fontWeight: "700",
  },
  inlineCreateCard: {
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  inlineCreateConfirm: {
    marginTop: 10,
    minHeight: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.clayDark,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineCreateConfirmText: {
    color: "#FFF9F3",
    fontSize: 13,
    fontWeight: "700",
  },
  inlineCreateConfirmDisabled: {
    backgroundColor: colors.subtle,
  },
  archiveTextInput: {
    minHeight: 44,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  archiveTextArea: {
    minHeight: 76,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  datePicker: {
    gap: 8,
  },
  datePickerTrigger: {
    ...shadow.card,
    minHeight: 48,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  datePickerTriggerText: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  datePickerPlaceholder: {
    color: colors.subtle,
  },
  datePickerActionText: {
    color: colors.clayDark,
    fontSize: 12,
    fontWeight: "700",
  },
  datePickerPanel: {
    borderRadius: radius.md,
    padding: 8,
    gap: 8,
    backgroundColor: colors.surfaceSoft,
  },
  datePickerIOSSpinners: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    overflow: "hidden",
    minHeight: 170,
  },
  datePickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(40, 30, 24, 0.45)",
  },
  datePickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: 10,
    paddingBottom: 26,
    paddingHorizontal: 16,
    ...shadow.modal,
  },
  datePickerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginBottom: 4,
  },
  datePickerSheetTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  datePickerSheetDone: {
    color: colors.clayDark,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  datePickerIOSSpinner: {
    flex: 1,
    transform: [{ scale: 0.85 }],
  },
  datePickerIOSSpinnerDate: {
    flex: 2,
    transform: [{ scale: 0.85 }],
  },
  datePickerIOSSpinnerTime: {
    flex: 1,
    transform: [{ scale: 0.85 }],
  },
  datePickerIOSSpinnerDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: colors.line,
    marginVertical: 12,
  },
  datePickerNativeLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  datePickerAndroidActions: {
    flexDirection: "row",
    gap: 10,
  },
  datePickerWebRow: {
    flexDirection: "row",
    gap: 10,
  },
  datePickerWebField: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  datePickerNativeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  datePickerNativeButtonText: {
    color: colors.clayDark,
    fontSize: 13,
    fontWeight: "700",
  },
  pendingPrimaryButton: {
    backgroundColor: colors.subtle,
  },
  archiveSuccessHero: {
    borderRadius: radius.sm,
    padding: 22,
    backgroundColor: colors.sage,
    alignItems: "center",
    gap: 10,
    ...shadow.soft,
  },
  archiveSuccessIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.sageDark,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveSuccessTitle: {
    color: "#FFF9F3",
    fontSize: 22,
    fontWeight: "700",
  },
  archiveSuccessCopy: {
    color: "rgba(255,249,243,0.9)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    fontWeight: "700",
  },
  processingHero: {
    minHeight: 190,
    borderRadius: radius.sm,
    padding: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  processingHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  processingHeroTitle: {
    marginTop: 13,
    color: colors.ink,
    fontSize: 19,
    fontWeight: "700",
  },
  processingHeroCopy: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "700",
  },
  processingList: {
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  audioPlayerCard: {
    minHeight: 82,
    borderRadius: radius.md,
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadow.soft,
  },
  audioPlayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.clayDark,
    alignItems: "center",
    justifyContent: "center",
  },
  audioPlayButtonDisabled: {
    backgroundColor: colors.subtle,
    opacity: 0.55,
  },
  audioPlayerBody: {
    flex: 1,
    gap: 7,
  },
  audioPlayerTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  audioProgressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  audioProgressFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.clayDark,
  },
  audioPlayerMeta: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  audioUnavailableRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  processingRow: {
    minHeight: 68,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  processingDot: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  processingDotComplete: {
    backgroundColor: colors.sageDark,
  },
  archiveTargetCard: {
    minHeight: 88,
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  archiveTargetCardReady: {
    backgroundColor: "#F4F8F5",
    borderColor: "#C9DDD1",
  },
  archiveTargetIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: "#E8DED5",
    alignItems: "center",
    justifyContent: "center",
  },
  archiveTargetIconReady: {
    backgroundColor: colors.sageDark,
  },
  archiveTargetLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  archiveTargetValue: {
    marginTop: 3,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
  },
  archiveTargetValuePending: {
    color: colors.muted,
    fontSize: 14,
  },
  archiveTargetDetail: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  privacyPanel: {
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  privacyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  privacyCopy: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  searchBar: {
    height: 46,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchPlaceholder: {
    color: colors.subtle,
    fontSize: 14,
    fontWeight: "700",
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 0,
  },
  segmented: {
    height: 44,
    borderRadius: radius.sm,
    padding: 4,
    backgroundColor: colors.surfaceSoft,
    flexDirection: "row",
  },
  segmentButton: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  segmentTextActive: {
    color: colors.clayDark,
  },
  profileCard: {
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  createProfileButton: {
    minHeight: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.clayDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createProfileButtonText: {
    color: "#FFF9F3",
    fontSize: 15,
    fontWeight: "700",
  },
  identityPicker: {
    gap: 10,
  },
  identityOption: {
    minHeight: 74,
    borderRadius: radius.sm,
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
  },
  identityOptionActive: {
    backgroundColor: "#F7EDE4",
    borderColor: "#E7B9A8",
  },
  identityTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  identityTitleActive: {
    color: colors.clayDark,
  },
  identityDetail: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  formPreviewCard: {
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  formPreviewTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  formFieldLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 6,
  },
  formFieldHeader: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  inlineLink: {
    color: colors.clayDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  formHint: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  choiceGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  buildTag: {
    marginTop: 10,
    textAlign: "center",
    color: colors.subtle,
    fontSize: 12,
  },
  choicePill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  choicePillActive: {
    backgroundColor: colors.clayDark,
    borderColor: colors.clayDark,
  },
  choicePillText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  choicePillTextActive: {
    color: "#FFF9F3",
  },
  profileFormInput: {
    minHeight: 46,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  profileFormArea: {
    minHeight: 82,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  profileHeaderCard: {
    borderRadius: radius.sm,
    padding: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 14,
  },
  detailHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailName: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  detailStats: {
    flexDirection: "row",
    gap: 8,
  },
  miniStat: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    padding: 10,
    justifyContent: "center",
    gap: 3,
  },
  miniStatLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  miniStatValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  nextSessionStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    padding: 12,
  },
  nextSessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  nextSessionBody: {
    flex: 1,
    gap: 3,
  },
  nextSessionTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  nextSessionDate: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  nextSessionTime: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  nextSessionEmpty: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  nextSessionHint: {
    color: colors.subtle,
    fontSize: 12,
    fontWeight: "700",
  },
  nextSessionExpiredBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(196, 93, 84, 0.12)",
  },
  nextSessionExpiredBadgeText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  inlineActions: {
    flexDirection: "row",
    gap: 10,
  },
  profileSaveButton: {
    marginTop: 0,
    flex: 1,
    flexDirection: "row",
    gap: 7,
  },
  legalGrid: {
    flexDirection: "row",
    gap: 10,
  },
  legalFile: {
    flex: 1,
    minHeight: 86,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  legalIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyProfileState: {
    minHeight: 160,
    borderRadius: radius.sm,
    padding: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyProfileIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyProfileTitle: {
    marginTop: 10,
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyProfileCopy: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    fontWeight: "700",
  },
  sessionCard: {
    borderRadius: radius.sm,
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 13,
    ...shadow.soft,
  },
  missingSessionCard: {
    backgroundColor: colors.surfaceSoft,
    borderColor: "#E8D9CC",
    shadowOpacity: 0,
    opacity: 0.92,
  },
  sessionTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  sessionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  sessionIndex: {
    overflow: "hidden",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#E4EFE9",
    color: colors.sageDark,
    fontSize: 11,
    fontWeight: "700",
  },
  missingSessionIndex: {
    backgroundColor: "#EFE6DE",
    color: colors.muted,
  },
  sessionTime: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  sessionSummary: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  sessionTags: {
    maxWidth: 104,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 5,
  },
  sessionCardTools: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  sessionToolButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  sessionToolButtonDanger: {
    backgroundColor: "#FFF3F1",
    borderWidth: 1,
    borderColor: "#E8C1BC",
  },
  sessionToolText: {
    color: colors.clayDark,
    fontSize: 11,
    fontWeight: "700",
  },
  sessionToolTextDanger: {
    color: colors.danger,
  },
  sessionEditPanel: {
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 9,
  },
  tagEditRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  editableTag: {
    minHeight: 30,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: "#F5DED5",
    alignItems: "center",
    justifyContent: "center",
  },
  editableTagText: {
    color: colors.clayDark,
    fontSize: 11,
    fontWeight: "700",
  },
  tagAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smallActionDisabled: {
    opacity: 0.45,
  },
  sessionTag: {
    overflow: "hidden",
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: colors.surfaceSoft,
    color: colors.clayDark,
    fontSize: 10,
    fontWeight: "700",
  },
  sessionActionGrid: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
    flexDirection: "row",
    gap: 6,
  },
  sessionAction: {
    flex: 1,
    minHeight: 80,
    alignItems: "center",
    gap: 4,
  },
  sessionActionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionActionIcon_warm: {
    backgroundColor: "#F5DED5",
  },
  sessionActionIcon_green: {
    backgroundColor: "#E4EFE9",
  },
  sessionActionIcon_blue: {
    backgroundColor: "#E7EEF5",
  },
  sessionActionIcon_muted: {
    backgroundColor: colors.surfaceSoft,
  },
  sessionActionLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  sessionActionStatus: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    fontWeight: "700",
  },
  sessionFooter: {
    gap: 10,
  },
  sessionRule: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  sessionGenerateButton: {
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#E7B9A8",
    backgroundColor: "#FFF7EF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  sessionGenerateButtonPressed: {
    backgroundColor: "#FBE8DA",
  },
  sessionGenerateText: {
    color: colors.clayDark,
    fontSize: 13,
    fontWeight: "700",
  },
  dataRow: {
    minHeight: 62,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  summaryCard: {
    borderRadius: radius.sm,
    padding: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "700",
  },
  summaryCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
  },
  chapterRow: {
    minHeight: 68,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  chapterRowCurrent: {
    backgroundColor: "#F7EDE4",
  },
  chapterTime: {
    width: 58,
    color: colors.clayDark,
    fontSize: 13,
    fontWeight: "700",
  },
  transcriptTools: {
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  transcriptToolHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  transcriptToolTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  speakerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  speakerChip: {
    overflow: "hidden",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    color: colors.clayDark,
    fontSize: 12,
    fontWeight: "700",
  },
  speakerKeyLabel: {
    width: 72,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  transcriptSpeakerLabel: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 13,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.clayDark,
    fontSize: 14,
    fontWeight: "700",
  },
  transcriptToolCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "700",
  },
  transcriptCard: {
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 14,
  },
  transcriptTurn: {
    gap: 5,
  },
  transcriptSpeaker: {
    color: colors.clayDark,
    fontSize: 12,
    fontWeight: "700",
  },
  transcriptText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
  },
  exportPanel: {
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  recorderMeter: {
    width: "100%",
    height: 10,
    marginTop: 14,
    borderRadius: 5,
    backgroundColor: colors.surfaceSoft,
    overflow: "hidden",
  },
  recorderMeterFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: colors.sageDark,
  },
  filePreviewOpenButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filePreviewOpenText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  filePreviewOriginal: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  editorSeg: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceSoft,
    borderRadius: 10,
    padding: 3,
  },
  editorSegItem: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  editorSegItemActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  editorSegText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  editorSegTextActive: {
    color: colors.ink,
  },
  filePreviewCanvas: {
    minHeight: 320,
    borderRadius: radius.sm,
    padding: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  filePreviewIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  filePreviewTitle: {
    marginTop: 8,
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
    fontWeight: "700",
  },
  filePreviewMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    fontWeight: "700",
  },
  filePreviewPlaceholder: {
    marginTop: 20,
    width: "100%",
    minHeight: 120,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    color: colors.subtle,
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 13,
    fontWeight: "700",
  },
  filePreviewFrame: {
    marginTop: 14,
    width: "100%",
    height: 300,
    minHeight: 180,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  flexActionButton: {
    flex: 1,
  },
  fileActionStack: {
    gap: 9,
  },
  editorHeader: {
    borderRadius: radius.sm,
    padding: 15,
    backgroundColor: colors.clay,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  editorEyebrow: {
    color: "rgba(255,249,243,0.82)",
    fontSize: 12,
    fontWeight: "700",
  },
  editorHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  editorTitle: {
    marginTop: 4,
    color: "#FFF9F3",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "700",
  },
  ruleCard: {
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  ruleText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  editorToolbar: {
    flexDirection: "row",
    gap: 10,
  },
  editorStatusGrid: {
    flexDirection: "row",
    gap: 8,
  },
  editSection: {
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  editSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editSectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  editSectionInput: {
    minHeight: 86,
    padding: 0,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    textAlignVertical: "top",
  },
  editSectionInputLocked: {
    color: colors.muted,
  },
  savePanel: {
    gap: 10,
    marginTop: 2,
  },
  consentBackdrop: {
    minHeight: 620,
    justifyContent: "flex-end",
    borderRadius: radius.sm,
    backgroundColor: "rgba(55,49,45,0.18)",
    overflow: "hidden",
  },
  consentSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 14,
  },
  consentTopHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  consentTitle: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  consentCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "700",
  },
  consentList: {
    gap: 10,
  },
  consentItem: {
    minHeight: 66,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  consentItemSelected: {
    backgroundColor: "#FFF7EF",
    borderColor: "#E7B9A8",
  },
  emptyCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.clayDark,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedCheckbox: {
    backgroundColor: colors.clayDark,
    borderColor: colors.clayDark,
  },
  lockedConsentItem: {
    minHeight: 66,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: "#FFF4F0",
    borderWidth: 1,
    borderColor: "#F0D1C7",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  riskPanel: {
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: "#EEF5F0",
    borderWidth: 1,
    borderColor: "#D8E6DD",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  riskText: {
    flex: 1,
    color: colors.sageDark,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "700",
  },
  consentFooter: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryWideButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryWideText: {
    color: colors.clayDark,
    fontSize: 14,
    fontWeight: "700",
  },
  disabledWideButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.sm,
    backgroundColor: "#E8DED5",
    alignItems: "center",
    justifyContent: "center",
  },
  enabledWideButton: {
    backgroundColor: colors.clayDark,
  },
  disabledWideText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  enabledWideText: {
    color: "#FFF9F3",
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: "rgba(55,49,45,0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 390,
    borderRadius: radius.lg,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
    ...shadow.soft,
  },
  confirmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  confirmTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
  },
  confirmCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  confirmMeta: {
    color: colors.clayDark,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  confirmSourceScroll: {
    maxHeight: 180,
  },
  confirmSourceList: {
    gap: 8,
  },
  confirmSourceItem: {
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceSoft,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },
  confirmCancelButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  confirmPrimaryButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.clayDark,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmPrimaryButtonDisabled: {
    opacity: 0.68,
  },
  confirmPrimaryText: {
    color: "#FFF9F3",
    fontSize: 14,
    fontWeight: "700",
  },
  noticeToastBackdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-start",
    paddingTop: 76,
    backgroundColor: "rgba(28,25,23,0.2)",
  },
  noticeToast: {
    marginHorizontal: 14,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: "rgba(255,253,249,0.98)",
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    ...shadow.soft,
  },
  noticeToastTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  noticeToastDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  noticeToastClose: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: "#F2D9CD",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.clayDark,
    fontSize: 16,
    fontWeight: "700",
  },
  aiPanel: {
    borderRadius: radius.sm,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  aiTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  aiCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  chatBubble: {
    maxWidth: "82%",
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chatBubbleRight: {
    alignSelf: "flex-end",
    backgroundColor: colors.clay,
    borderColor: colors.clay,
  },
  chatText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  chatTextRight: {
    color: "#FFF9F3",
  },
  composer: {
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 6,
  },
  composerText: {
    flex: 1,
    color: colors.subtle,
    fontWeight: "700",
  },
  composerInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 0,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.clay,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: colors.subtle,
  },
  formHelp: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  twoColumnInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactInput: {
    width: 82,
  },
  flexInput: {
    flex: 1,
  },
  chatMessageGroup: {
    gap: 7,
  },
  citationPanel: {
    alignSelf: "flex-end",
    width: "86%",
    borderRadius: radius.sm,
    padding: 10,
    backgroundColor: "#EEF5F0",
    borderWidth: 1,
    borderColor: "#D8E6DD",
    gap: 4,
  },
  citationTitle: {
    color: colors.sageDark,
    fontSize: 11,
    fontWeight: "700",
  },
  citationText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  processingChat: {
    minHeight: 52,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  stopButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: "#FFF3F1",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  stopButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  poster: {
    borderRadius: radius.sm,
    padding: 18,
    minHeight: 156,
    backgroundColor: "#E8F0EC",
    borderWidth: 1,
    borderColor: "#D8E6DD",
    justifyContent: "space-between",
  },
  posterTitle: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  posterCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  articleRow: {
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  articleTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  articleHero: {
    borderRadius: radius.sm,
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  articleDetailTitle: {
    color: colors.ink,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "700",
  },
  articleLead: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "700",
  },
  articlePoint: {
    minHeight: 74,
    borderRadius: radius.sm,
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  articlePointIndex: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: "#E7EEF5",
    color: "#536F90",
    textAlign: "center",
    lineHeight: 28,
    fontSize: 12,
    fontWeight: "700",
  },
  articlePointText: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  metricSummary: {
    minHeight: 154,
    borderRadius: radius.sm,
    padding: 18,
    backgroundColor: colors.clay,
    justifyContent: "center",
  },
  metricSummaryLabel: {
    color: "rgba(255,249,243,0.82)",
    fontSize: 12,
    fontWeight: "700",
  },
  metricSummaryValue: {
    marginTop: 8,
    color: "#FFF9F3",
    fontSize: 38,
    fontWeight: "700",
  },
  metricSummaryCopy: {
    marginTop: 4,
    color: "rgba(255,249,243,0.88)",
    fontSize: 13,
    fontWeight: "700",
  },
  statValue: {
    color: colors.clayDark,
    fontSize: 17,
    fontWeight: "700",
  },
  segmentedScroll: {
    flexDirection: "row",
    gap: 6,
  },
  calendarPanel: {
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  calendarNavButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarNavText: {
    color: colors.clayDark,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "700",
  },
  calendarTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  calendarWeekRow: {
    flexDirection: "row",
  },
  calendarWeekday: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  calendarDay: {
    width: "13.75%",
    aspectRatio: 0.92,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 4,
  },
  calendarDayMuted: {
    opacity: 0.42,
  },
  calendarDayActive: {
    backgroundColor: "#F7EDE4",
    borderColor: "#E7B9A8",
  },
  calendarDayText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  calendarDayTextMuted: {
    color: colors.subtle,
  },
  calendarDayTextActive: {
    color: colors.clayDark,
  },
  calendarTodayDot: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.sageDark,
  },
  calendarTodayDotActive: {
    backgroundColor: colors.clayDark,
  },
  calendarEventCount: {
    color: colors.sageDark,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
  },
  calendarEventCountActive: {
    color: colors.clayDark,
  },
  dayButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  dayButtonActive: {
    backgroundColor: "#F7EDE4",
    borderColor: "#E7B9A8",
  },
  dayButtonText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    fontWeight: "700",
  },
  dayButtonTextActive: {
    color: colors.clayDark,
  },
  securityTabs: {
    flexDirection: "row",
    padding: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 5,
  },
  securityTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  securityTabActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  securityTabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  securityTabTextActive: {
    color: colors.clayDark,
  },
  smallActionButton: {
    minHeight: 34,
    paddingHorizontal: 9,
    borderRadius: radius.sm,
    backgroundColor: "#FFF7EF",
    borderWidth: 1,
    borderColor: "#E7B9A8",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  smallActionText: {
    color: colors.clayDark,
    fontSize: 11,
    fontWeight: "700",
  },
  accountCard: {
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarLarge: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: "#F2D9CD",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLargeText: {
    color: colors.clayDark,
    fontSize: 22,
    fontWeight: "700",
  },
  accountName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  privacyResource: {
    minHeight: 66,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  privacyResourceCard: {
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  privacyResourceMain: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  privacyResourceFooter: {
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  listMoreRow: {
    alignItems: "center",
    paddingVertical: 10,
  },
  listMoreText: {
    color: colors.clayDark,
    fontSize: 13,
    fontWeight: "700",
  },
  privacyDeleteConfirm: {
    borderRadius: radius.sm,
    padding: 11,
    backgroundColor: "#FFF3F1",
    borderWidth: 1,
    borderColor: "#E8C1BC",
    gap: 9,
  },
  conversationCard: {
    borderRadius: radius.sm,
    padding: 11,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 9,
  },
  conversationSelect: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  conversationDelete: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    gap: 5,
  },
  settingsList: {
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  settingsRow: {
    minHeight: 62,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  toggleRow: {
    minHeight: 70,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  toggleRowDisabled: {
    opacity: 0.58,
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: radius.pill,
    padding: 3,
    backgroundColor: colors.line,
  },
  toggleTrackEnabled: {
    backgroundColor: colors.sage,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  toggleThumbEnabled: {
    alignSelf: "flex-end",
  },
  dangerCard: {
    borderRadius: radius.sm,
    padding: 14,
    backgroundColor: "#FFF3F1",
    borderWidth: 1,
    borderColor: "#E8C1BC",
    gap: 9,
  },
  dangerTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "700",
  },
  dangerCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  dangerActions: {
    flexDirection: "row",
    gap: 8,
  },
  dangerCancelButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerCancelButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  dangerButton: {
    minHeight: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#E8C1BC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  dangerConfirmButton: {
    flex: 1,
  },
  dangerButtonDisabled: {
    opacity: 0.55,
  },
  dangerButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    height: 66,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,253,249,0.96)",
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    ...shadow.soft,
  },
  tabItem: {
    flex: 1,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabLabel: {
    color: colors.subtle,
    fontSize: 11,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: colors.clayDark,
  },
});
