import { StatusBar } from "expo-status-bar";
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
  Mic,
  Newspaper,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  X,
  Trash2,
  UserRound,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ScrollView,
} from "react-native";

import { buildArchiveResult, describeArchiveTarget, filterArchiveCandidates, type ArchiveKind } from "./src/archiveFlow";
import { buildNewProfile, filterProfiles, type ProfileFilter, type ProfileListItem } from "./src/profileLibrary";
import { describeRecordingContext, getRecordingDestination, toArchiveRecording, type ArchiveRecording } from "./src/recordingFlow";
import { getAuthorizableResources, mergeAuthorizedResources, type PrivacyResource } from "./src/privacyFlow";
import { getSelectableCaseReportMaterials, type CaseReportMaterial } from "./src/caseReportFlow";
import { buildDownloadArtifact, scheduleDownload } from "./src/downloadFlow";
import { decideRecordingRegeneration, updateAtIndex } from "./src/recordingEditorFlow";
import {
  addSessionMaterial,
  getMaterialUpdateMessage,
  materialCategoryCopy,
  removeMaterialsForSession,
  removeSessionMaterial,
  updateSessionMaterial,
  type MaterialCategory,
  type SessionMaterial,
} from "./src/sessionMaterials";
import {
  addSessionTag,
  formatSessionTime,
  removeSession,
  sortSessionsDescending,
  updateSession,
  type SessionHistoryItem,
} from "./src/sessionHistory";
import { buildSupervisionReply, type SupervisionContext } from "./src/supervisionFlow";
import {
  formatBadge,
  metrics,
  privacyResources,
  profiles,
  recordings,
  reminders,
  recordSections,
  summaryChapters,
  transcriptTurns,
  type TabKey,
} from "./src/mockData";
import { colors, radius, shadow } from "./src/theme";

type QuickView =
  | "overview"
  | "recording"
  | "recordingRecords"
  | "recordingProcessing"
  | "archive"
  | "archiveComplete"
  | "supervision"
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
  | "privacyConsent"
  | "articleDetail"
  | "statistics"
  | "schedule"
  | "securitySettings";
type Notice = { title: string; detail: string };
type ArchiveResult = ReturnType<typeof buildArchiveResult>;
type EditableRecordSection = { title: string; content: string };
type EditableChapter = { time: string; title: string; current?: boolean };
type EditableTranscriptTurn = { time: string; speaker: string; text: string };
type RecordingItem = {
  title: string;
  duration: string;
  status: string;
  archive: string;
  ttl: string;
  profileName: string | null;
  kindLabel: "来访者" | "督导师" | "受督者" | null;
  recordLabel: string | null;
};
type PreviewFile = {
  id: string;
  ownerKey?: string;
  title: string;
  meta: string;
  fileType: string;
  source: "material" | "legal";
};

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

const initialSessionHistory: SessionHistoryItem[] = [
  {
    id: "session-6",
    sequence: 6,
    occurredAt: "2026-06-05T10:00:00+08:00",
    summary: "围绕睡眠下降、工作评价焦虑和关系议题展开。",
    tags: ["焦虑", "睡眠"],
    recording: "剩余 13 天",
    record: "草稿",
    scale: "未上传",
    homework: "已布置",
    other: "1 项",
  },
  {
    id: "session-5",
    sequence: 5,
    occurredAt: "2026-05-29T10:00:00+08:00",
    summary: "梳理近期压力事件，并继续识别自动化想法。",
    tags: ["长期保存", "正式版"],
    recording: "已销毁",
    record: "正式版",
    scale: "SAS",
    homework: "已提交",
    other: "无",
  },
];

const initialSessionMaterials: SessionMaterial[] = [
  { id: "session-6-recording-1", sessionId: "session-6", category: "recording", title: "第 6 次咨询原始录音", meta: "音频 · 52:18 · 剩余 13 天", preservable: false },
  { id: "session-6-scale-1", sessionId: "session-6", category: "scale", title: "SAS 焦虑自评量表", meta: "PDF · 6月5日上传 · 可参与记录生成", preservable: true },
  { id: "session-6-homework-1", sessionId: "session-6", category: "homework", title: "睡前想法记录", meta: "图片 · 已提交 · 可参与记录生成", preservable: true },
  { id: "session-6-other-1", sessionId: "session-6", category: "other", title: "工作事件时间线", meta: "PDF · 已解析文字 · 可参与记录生成", preservable: true },
  { id: "session-5-scale-1", sessionId: "session-5", category: "scale", title: "SAS 初测", meta: "PDF · 5月29日上传 · 长期保存", preservable: true },
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

function getProfileSessions(profile: ArchiveResult): SessionHistoryItem[] {
  if (profile.profileName === "陈雨") return initialSessionHistory;
  if (profile.recordLabel === "尚无记录") return [];
  const sequence = Number(profile.recordLabel.match(/\d+/)?.[0] ?? 1);
  return [{
    id: `session-${sequence}`,
    sequence,
    occurredAt: "2026-06-08T18:00:00+08:00",
    summary: "录音已归档，完整转写和录音纪要正在后台生成。",
    tags: ["处理中"],
    recording: "剩余 13 天",
    record: "待生成",
    scale: "未上传",
    homework: "未添加",
    other: "无",
  }];
}

function normalizeSessionDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("T")) return trimmed;
  return `${trimmed.replace(" ", "T")}:00+08:00`;
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const [quickView, setQuickView] = useState<QuickView>("overview");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [archiveResult, setArchiveResult] = useState<ArchiveResult | null>(null);
  const [archiveRecording, setArchiveRecording] = useState<ArchiveRecording>({
    title: "新录音 06-07",
    duration: "42:18",
  });
  const [archiveReturn, setArchiveReturn] = useState<QuickView>("recording");
  const [activeRecording, setActiveRecording] = useState<RecordingItem>(recordings[0]);
  const [authorizedResources, setAuthorizedResources] = useState<string[]>([]);
  const [consentResources, setConsentResources] = useState<PrivacyResource[]>(getAuthorizableResources(privacyResources));
  const [profileItems, setProfileItems] = useState<ProfileListItem[]>(profiles);
  const [recordEditorReturn, setRecordEditorReturn] = useState<QuickView>("profileDetail");
  const [privacyReturn, setPrivacyReturn] = useState<{ quickView: QuickView; tab: TabKey }>({
    quickView: "overview",
    tab: "account",
  });
  const [activeProfile, setActiveProfile] = useState<ArchiveResult>({
    profileName: "陈雨",
    kindLabel: "来访者",
    recordLabel: "第 6 次咨询",
  });
  const [recordEditorSections, setRecordEditorSections] = useState<EditableRecordSection[]>(getRecordEditorSections("来访者"));
  const [recordFormal, setRecordFormal] = useState(false);
  const [recordDirty, setRecordDirty] = useState(true);
  const [caseReportSections, setCaseReportSections] = useState<EditableRecordSection[]>(getCaseReportSections());
  const [caseReportFormal, setCaseReportFormal] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>(initialSessionHistory);
  const [sessionMaterials, setSessionMaterials] = useState<SessionMaterial[]>(initialSessionMaterials);
  const [activeMaterialCategory, setActiveMaterialCategory] = useState<MaterialCategory>("recording");
  const [activeSessionId, setActiveSessionId] = useState("session-6");
  const [materialReturn, setMaterialReturn] = useState<QuickView>("profileDetail");
  const [filePreviewReturn, setFilePreviewReturn] = useState<QuickView>("sessionMaterials");
  const [activeFile, setActiveFile] = useState<PreviewFile | null>(null);
  const [legalFileNames, setLegalFileNames] = useState<Record<string, string>>({});
  const [recordingSummary, setRecordingSummary] = useState(describeRecordingContext(recordings[0].title).summary);
  const [recordingChapters, setRecordingChapters] = useState<EditableChapter[]>(summaryChapters);
  const [recordingTurns, setRecordingTurns] = useState<EditableTranscriptTurn[]>(transcriptTurns);
  const [recordingHasEdits, setRecordingHasEdits] = useState(false);
  const [activeArticle, setActiveArticle] = useState(articles[0]);
  const { width } = useWindowDimensions();
  const isCompact = width < 430;
  const showNotice = (title: string, detail: string) => setNotice({ title, detail });
  const prepareRecordEditor = (kindLabel: string, returnView: QuickView) => {
    setRecordEditorReturn(returnView);
    setRecordEditorSections(getRecordEditorSections(kindLabel));
    setRecordFormal(false);
    setRecordDirty(true);
    setQuickView("recordEditor");
  };
  const openPrivacy = (returnView: QuickView, resources: PrivacyResource[] = getAuthorizableResources(privacyResources)) => {
    setPrivacyReturn({ quickView: returnView, tab });
    setConsentResources(resources);
    setQuickView("privacyConsent");
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
  const openMaterials = (category: MaterialCategory, sessionId: string, returnView: QuickView = "profileDetail") => {
    setActiveMaterialCategory(category);
    setActiveSessionId(sessionId);
    setMaterialReturn(returnView);
    setQuickView("sessionMaterials");
  };
  const openFilePreview = (file: PreviewFile, returnView: QuickView) => {
    setActiveFile(file);
    setFilePreviewReturn(returnView);
    setQuickView("filePreview");
  };
  const handleBack = () => {
    if (quickView === "privacyConsent") {
      setTab(privacyReturn.tab);
      setQuickView(privacyReturn.quickView);
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
      setQuickView("recordingRecords");
      return;
    }
    if (quickView === "profileDetail" || quickView === "profileCreate") {
      setTab("profiles");
      setQuickView("overview");
      return;
    }
    if (quickView === "privacyCenter") {
      setTab("account");
      setQuickView("overview");
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
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(timeout);
  }, [notice]);

  const title = useMemo(() => {
    if (quickView === "recording") return "正在录音";
    if (quickView === "recordingRecords") return "录音记录";
    if (quickView === "recordingProcessing") return "录音处理中";
    if (quickView === "archive") return "归档确认";
    if (quickView === "archiveComplete") return "归档完成";
    if (quickView === "supervision") return "智能督导";
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
    if (quickView === "privacyConsent") return "长期保存授权";
    if (quickView === "articleDetail") return "资讯详情";
    if (quickView === "statistics") return "本周统计";
    if (quickView === "schedule") return "日程";
    if (quickView === "securitySettings") return "安全设置";
    if (tab === "profiles") return "档案库";
    if (tab === "recordings") return "资讯";
    if (tab === "account") return "我的";
    return "今天要做什么";
  }, [activeMaterialCategory, activeProfile.kindLabel, quickView, tab]);
  const hideBottomTabs = [
    "recording",
    "archive",
    "profileCreate",
    "recordEditor",
    "chapterEditor",
    "transcriptEditor",
    "sessionMaterials",
    "filePreview",
    "caseReportSelect",
    "caseReportEditor",
    "privacyConsent",
    "articleDetail",
    "statistics",
    "schedule",
    "securitySettings",
  ].includes(quickView);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={[styles.phoneShell, isCompact && styles.phoneShellCompact]}>
        <Header title={title} quickView={quickView} onBack={handleBack} onOpenSchedule={() => setQuickView("schedule")} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {tab === "home" && quickView === "overview" ? (
            <HomeScreen
              onOpen={setQuickView}
              onOpenProfiles={() => setTab("profiles")}
              onOpenSchedule={() => setQuickView("schedule")}
              onOpenStatistics={() => setQuickView("statistics")}
            />
          ) : null}
          {quickView === "recording" ? <RecordingScreen onCancel={() => setQuickView("overview")} onArchive={() => {
            setArchiveRecording({ title: "新录音 06-07", duration: "42:18" });
            setArchiveReturn("recording");
            setQuickView("archive");
          }} onNotice={showNotice} /> : null}
          {quickView === "recordingRecords" ? (
            <RecordingRecordsScreen
              onOpen={(recording) => {
                const destination = getRecordingDestination(recording);
                setActiveRecording(recording);
                resetRecordingEditor(recording);
                if (recording.profileName && recording.kindLabel && recording.recordLabel) {
                  const nextProfile = {
                    profileName: recording.profileName,
                    kindLabel: recording.kindLabel,
                    recordLabel: recording.recordLabel,
                  };
                  setActiveProfile(nextProfile);
                  setSessionHistory(getProfileSessions(nextProfile));
                }
                if (destination === "archive") {
                  setArchiveRecording(toArchiveRecording(recording));
                  setArchiveReturn("recordingRecords");
                }
                setQuickView(destination === "archive" ? "archive" : destination === "processing" ? "recordingProcessing" : "recordingDetail");
              }}
              onNotice={showNotice}
            />
          ) : null}
          {quickView === "recordingProcessing" ? <RecordingProcessingScreen recording={activeRecording} /> : null}
          {quickView === "archive" ? <ArchiveScreen recording={archiveRecording} onNotice={showNotice} onComplete={(result) => {
            setArchiveResult(result);
            setQuickView("archiveComplete");
          }} /> : null}
          {quickView === "archiveComplete" && archiveResult ? (
            <ArchiveCompleteScreen
              result={archiveResult}
              onOpenProfile={() => {
                setActiveProfile(archiveResult);
                setSessionHistory(getProfileSessions(archiveResult));
                setQuickView("profileDetail");
              }}
              onOpenRecords={() => setQuickView("recordingRecords")}
            />
          ) : null}
          {quickView === "supervision" ? <SupervisionScreen /> : null}
          {quickView === "profileDetail" ? (
            <ProfileDetailScreen
              profile={activeProfile}
              sessions={sessionHistory}
              legalFileNames={legalFileNames}
              onSessionsChange={(nextSessions) => {
                const remainingIds = new Set(nextSessions.map((session) => session.id));
                const deletedIds = sessionHistory.filter((session) => !remainingIds.has(session.id)).map((session) => session.id);
                setSessionHistory(nextSessions);
                if (deletedIds.length > 0) {
                  setSessionMaterials((current) => deletedIds.reduce(removeMaterialsForSession, current));
                }
              }}
              onLegalFilesChange={setLegalFileNames}
              onOpenRecord={() => prepareRecordEditor(activeProfile.kindLabel, "profileDetail")}
              onOpenCaseReport={() => {
                setCaseReportSections(getCaseReportSections());
                setCaseReportFormal(false);
                setQuickView("caseReportSelect");
              }}
              onOpenMaterial={(category, sessionId) => openMaterials(category, sessionId)}
              onPreviewLegal={(title, meta) => openFilePreview({
                id: `legal-${title}`,
                ownerKey: title,
                title,
                meta,
                fileType: "PDF",
                source: "legal",
              }, "profileDetail")}
              onNotice={showNotice}
            />
          ) : null}
          {quickView === "profileCreate" ? (
            <ProfileCreateScreen
              onNotice={showNotice}
              onCreate={(profile) => {
                setProfileItems((current) => [profile, ...current]);
                setActiveProfile({
                  profileName: profile.name,
                  kindLabel: profile.type,
                  recordLabel: "尚无记录",
                });
                setSessionHistory([]);
                setQuickView("profileDetail");
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
              onOpenRecord={() => prepareRecordEditor(activeProfile.kindLabel, "recordingDetail")}
              onOpenChapters={() => setQuickView("chapterEditor")}
              onOpenTranscript={() => setQuickView("transcriptEditor")}
              onRegenerated={() => {
                resetRecordingEditor(activeRecording);
                setRecordingSummary(`${describeRecordingContext(activeRecording.title).summary} 已结合最新校对内容重新生成。`);
                showNotice("重新生成任务已完成", "纪要、章节和转写已更新；原正式记录未被覆盖。");
              }}
              onNotice={showNotice}
              onOpenPrivacy={() => openPrivacy("recordingDetail", [
                { title: `${activeRecording.title}转写`, type: "转写文本", expires: "13 天后销毁", preservable: true },
                { title: `${activeRecording.title}录音纪要`, type: "录音纪要", expires: "13 天后销毁", preservable: true },
              ])}
            />
          ) : null}
          {quickView === "chapterEditor" ? (
            <ChapterEditorScreen
              chapters={recordingChapters}
              onChange={(index, chapter) => {
                setRecordingChapters((current) => updateAtIndex(current, index, chapter));
                setRecordingHasEdits(true);
              }}
              onSave={() => {
                setQuickView("recordingDetail");
                showNotice("章节已保存", "章节标题和时间点已同步到当前录音纪要。");
              }}
            />
          ) : null}
          {quickView === "transcriptEditor" ? (
            <TranscriptEditorScreen
              turns={recordingTurns}
              onChange={(index, turn) => {
                setRecordingTurns((current) => updateAtIndex(current, index, turn));
                setRecordingHasEdits(true);
              }}
              onSave={() => {
                setQuickView("recordingDetail");
                showNotice("转写校对已保存", "最新发言人与文本将用于后续纪要和记录生成。");
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
              }, "sessionMaterials")}
              onAdd={(title, fileType) => {
                setSessionMaterials((current) => addSessionMaterial(current, {
                  sessionId: activeSessionId,
                  category: activeMaterialCategory,
                  title,
                  fileType,
                }));
                setRecordDirty(true);
                showNotice("资料已添加", getMaterialUpdateMessage(activeMaterialCategory));
              }}
              onAuthorize={() => openPrivacy("sessionMaterials", sessionMaterials
                .filter((item) => item.sessionId === activeSessionId && item.category === activeMaterialCategory && item.preservable)
                .map((item) => ({ title: item.title, type: materialCategoryCopy[item.category].title, expires: "14 天后销毁", preservable: true })))}
            />
          ) : null}
          {quickView === "filePreview" && activeFile ? (
            <FilePreviewScreen
              file={activeFile}
              onUpdate={(title, fileType) => {
                if (activeFile.source === "material") {
                  setSessionMaterials((current) => updateSessionMaterial(current, activeFile.id, { title, fileType }));
                } else {
                  setLegalFileNames((current) => ({ ...current, [activeFile.ownerKey ?? activeFile.title]: title }));
                }
                setActiveFile((current) => current ? {
                  ...current,
                  title,
                  fileType,
                  meta: `${fileType} · 刚刚更新`,
                } : current);
                showNotice("文件已更新", "预览与所属咨询记录材料已同步更新。");
              }}
              onDelete={() => {
                if (activeFile.source === "material") {
                  setSessionMaterials((current) => removeSessionMaterial(current, activeFile.id));
                } else {
                  setLegalFileNames((current) => ({ ...current, [activeFile.ownerKey ?? activeFile.title]: "已删除" }));
                }
                setQuickView(filePreviewReturn);
                showNotice("文件已删除", "文件已从当前资料列表移除，此操作不可恢复。");
              }}
            />
          ) : null}
          {quickView === "recordEditor" ? <RecordEditorScreen
            profile={activeProfile}
            sections={recordEditorSections}
            formal={recordFormal}
            dirty={recordDirty}
            onSectionsChange={setRecordEditorSections}
            onFormalChange={setRecordFormal}
            onDirtyChange={setRecordDirty}
            onOpenPrivacy={() => openPrivacy("recordEditor", [
            { title: `${activeProfile.profileName} ${activeProfile.recordLabel}记录草稿`, type: "本次记录", expires: "14 天后销毁", preservable: true },
            { title: `${activeProfile.profileName} ${activeProfile.recordLabel}正式版`, type: "本次记录", expires: "生成后 14 天销毁", preservable: true },
          ])} onNotice={showNotice} /> : null}
          {quickView === "caseReportSelect" ? <CaseReportMaterialScreen profile={activeProfile} onGenerate={() => setQuickView("caseReportEditor")} /> : null}
          {quickView === "caseReportEditor" ? <CaseReportEditorScreen
            profile={activeProfile}
            sections={caseReportSections}
            formal={caseReportFormal}
            onSectionsChange={setCaseReportSections}
            onFormalChange={setCaseReportFormal}
            onOpenPrivacy={() => openPrivacy("caseReportEditor", [
            { title: `${activeProfile.profileName} 个案报告草稿`, type: "个案报告", expires: "14 天后销毁", preservable: true },
            { title: `${activeProfile.profileName} 个案报告正式版`, type: "个案报告", expires: "生成后 14 天销毁", preservable: true },
          ])} onNotice={showNotice} /> : null}
          {quickView === "privacyCenter" ? (
            <PrivacyCenterScreen
              authorizedResources={authorizedResources}
              onAuthorize={() => openPrivacy("privacyCenter")}
              onNotice={showNotice}
            />
          ) : null}
          {quickView === "privacyConsent" ? (
            <PrivacyConsentScreen
              resources={consentResources}
              onCancel={() => {
                setTab(privacyReturn.tab);
                setQuickView(privacyReturn.quickView);
              }}
              onComplete={(selected) => {
                setAuthorizedResources((current) => mergeAuthorizedResources(current, selected));
                setTab(privacyReturn.tab);
                setQuickView(privacyReturn.quickView);
              }}
            />
          ) : null}
          {quickView === "articleDetail" ? <ArticleDetailScreen article={activeArticle} /> : null}
          {quickView === "statistics" ? <StatisticsScreen /> : null}
          {quickView === "schedule" ? <ScheduleScreen onStartRecording={() => setQuickView("recording")} /> : null}
          {quickView === "securitySettings" ? <SecuritySettingsScreen onNotice={showNotice} /> : null}
          {tab === "profiles" && quickView === "overview" ? (
            <ProfilesScreen
              profiles={profileItems}
              onOpenDetail={(profile) => {
                const recordNoun = profile.type === "来访者" ? "咨询" : profile.type === "督导师" ? "受督" : "督导";
                setActiveProfile({
                  profileName: profile.name,
                  kindLabel: profile.type,
                  recordLabel: profile.count === "尚无记录" ? profile.count : `${profile.count}${recordNoun}`,
                });
                setSessionHistory(getProfileSessions({
                  profileName: profile.name,
                  kindLabel: profile.type,
                  recordLabel: profile.count === "尚无记录" ? profile.count : `${profile.count}${recordNoun}`,
                }));
                setQuickView("profileDetail");
              }}
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
              onOpenPrivacy={() => setQuickView("privacyCenter")}
              onOpenSecurity={() => setQuickView("securitySettings")}
              onNotice={showNotice}
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
  onOpen,
  onOpenProfiles,
  onOpenSchedule,
  onOpenStatistics,
}: {
  onOpen: (view: QuickView) => void;
  onOpenProfiles: () => void;
  onOpenSchedule: () => void;
  onOpenStatistics: () => void;
}) {
  return (
    <View style={styles.stack}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>今日提醒</Text>
            <Text style={styles.heroTitle}>2 个安排待处理</Text>
          </View>
          <CalendarDays size={24} color="#FFF9F3" />
        </View>
        <Text style={styles.heroCopy}>陈雨的第 6 次咨询将在 10:00 开始，录音结束后可直接归档并生成纪要。</Text>
        <View style={styles.heroActions}>
          <PrimaryButton icon={Mic} label="开始录音" onPress={() => onOpen("recording")} />
        </View>
      </View>

      <View style={styles.quickGrid}>
        <QuickAction icon={Mic} label="录音记录" detail="3 条待处理" onPress={() => onOpen("recordingRecords")} />
        <QuickAction icon={FolderOpen} label="档案库" detail="24 个档案" onPress={onOpenProfiles} />
        <QuickAction icon={Sparkles} label="智能督导" detail="仅读取已选资料" onPress={() => onOpen("supervision")} />
      </View>

      <SectionHeader title="本周统计" action="明细" onAction={onOpenStatistics} />
      <View style={styles.metricRow}>
        {metrics.map((item) => (
          <View key={item.label} style={styles.metricCard}>
            <Text style={styles.metricValue}>{item.value}</Text>
            <Text style={styles.metricLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="近期任务" action="完整日程" onAction={onOpenSchedule} />
      <View style={styles.cardStack}>
        {reminders.map((item) => (
          <TouchableOpacity key={item.title} style={styles.listCard} activeOpacity={0.78} onPress={onOpenSchedule}>
            <View style={styles.timePill}>
              <Text style={styles.timePillText}>{item.time}</Text>
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listMeta}>{item.kind} · {item.privacy}</Text>
            </View>
            <ChevronRight size={18} color={colors.subtle} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function RecordingScreen({ onCancel, onArchive, onNotice }: { onCancel: () => void; onArchive: () => void; onNotice: (title: string, detail: string) => void }) {
  const [paused, setPaused] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <View style={styles.stack}>
      <View style={styles.recorderPanel}>
        <View style={styles.recorderRing}>
          <View style={styles.recorderDot} />
          <Text style={styles.recorderTime}>00:42:18</Text>
          <Text style={styles.recorderState}>{paused ? "暂停中" : "录音中"}</Text>
        </View>
        <View style={styles.controlRow}>
          <TouchableOpacity style={[styles.cancelButton, confirmCancel && styles.cancelButtonDanger]} activeOpacity={0.75} onPress={() => {
            if (!confirmCancel) {
              setConfirmCancel(true);
              onNotice("再次确认取消", "再次点击确认取消会丢弃当前未保存录音。");
              return;
            }
            onCancel();
          }}>
            <Text style={[styles.cancelButtonText, confirmCancel && styles.cancelButtonTextDanger]}>{confirmCancel ? "确认取消" : "取消"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pauseButton} activeOpacity={0.75} onPress={() => {
            setPaused((current) => !current);
            onNotice(paused ? "继续录音" : "录音已暂停", paused ? "计时继续，保存后进入归档确认。" : "可继续录制、取消或保存进入归档。");
          }}>
            <Pause size={22} color="#FFF9F3" fill="#FFF9F3" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} activeOpacity={0.75} onPress={onArchive}>
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
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
    </View>
  );
}

function RecordingRecordsScreen({
  onOpen,
  onNotice,
}: {
  onOpen: (recording: RecordingItem) => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadedRecordings, setUploadedRecordings] = useState<string[]>([]);
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
          <TextInput
            value={uploadName}
            onChangeText={setUploadName}
            placeholder="录音文件名，例如 6月8日咨询.m4a"
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
          />
          <Text style={styles.formHelp}>上传后先进入待归档状态，不会自动读取任何档案资料。</Text>
          <TouchableOpacity style={[styles.inlineCreateConfirm, !uploadName.trim() && styles.inlineCreateConfirmDisabled]} activeOpacity={0.78} onPress={() => {
            if (!uploadName.trim()) {
              onNotice("请填写文件名", "选择本地音频后，文件名会自动带入。");
              return;
            }
            setUploadedRecordings((current) => [uploadName.trim(), ...current]);
            setUploadName("");
            setShowUpload(false);
            onNotice("录音已上传", "录音已进入待归档列表，选择归属档案后开始转写。");
          }}>
            <Text style={styles.inlineCreateConfirmText}>确认上传</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.cardStack}>
        {uploadedRecordings.map((title) => (
          <TouchableOpacity
            key={title}
            style={styles.recordingCard}
            activeOpacity={0.78}
            onPress={() => onOpen({
              title,
              duration: "待识别",
              status: "可查看",
              archive: "待归档",
              ttl: "剩余 14 天",
              profileName: null,
              kindLabel: null,
              recordLabel: null,
            })}
          >
            <View style={styles.recordingIcon}><Upload size={20} color={colors.clayDark} /></View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{title}</Text>
              <Text style={styles.listMeta}>刚刚上传 · 归档后开始处理</Text>
              <View style={styles.badgeRow}><Badge label="待归档" tone="warm" /></View>
            </View>
            <ChevronRight size={18} color={colors.subtle} />
          </TouchableOpacity>
        ))}
        {recordings.map((item) => (
          <TouchableOpacity key={item.title} style={styles.recordingCard} activeOpacity={0.78} onPress={() => onOpen(item)}>
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

function RecordingProcessingScreen({ recording }: { recording: RecordingItem }) {
  return (
    <View style={styles.stack}>
      <View style={styles.noticeCard}>
        <Clock3 size={24} color={colors.clayDark} />
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>{recording.title}</Text>
          <Text style={styles.listMeta}>{recording.duration} · {recording.archive} · 后台处理中</Text>
        </View>
      </View>
      <View style={styles.processingHero}>
        <View style={styles.processingHeroIcon}>
          <RefreshCcw size={28} color={colors.clayDark} />
        </View>
        <Text style={styles.processingHeroTitle}>正在生成录音纪要</Text>
        <Text style={styles.processingHeroCopy}>可以离开此页面，处理完成后会在录音记录和对应档案中更新。</Text>
      </View>
      <View style={styles.processingList}>
        <ProcessingRow title="原始录音" detail="已保存，13 天后自动销毁" status="完成" complete />
        <ProcessingRow title="完整转写" detail="正在识别发言人与时间戳" status="处理中" />
        <ProcessingRow title="录音纪要" detail="等待转写完成后生成" status="等待中" />
        <ProcessingRow title="章节速览" detail="等待录音纪要生成" status="等待中" />
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>处理失败时可重新生成</Text>
        <Text style={styles.privacyCopy}>只要原始录音仍在 14 天保存期内，就可以重新生成；原始录音销毁后不能重试。</Text>
      </View>
    </View>
  );
}

function ArchiveScreen({
  recording,
  onNotice,
  onComplete,
}: {
  recording: ArchiveRecording;
  onNotice: (title: string, detail: string) => void;
  onComplete: (result: ArchiveResult) => void;
}) {
  const [kind, setKind] = useState<ArchiveKind>("client");
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileNote, setNewProfileNote] = useState("");
  const archiveKinds = [
    { key: "client" as const, label: "来访者", detail: "咨询记录" },
    { key: "supervisor" as const, label: "督导师", detail: "受督记录" },
    { key: "supervisee" as const, label: "受督者", detail: "督导记录" },
  ];
  const candidatesByKind = {
    client: [
      { id: "chen-yu", name: "陈雨", code: "A08", completedCount: 6, meta: "进行中 · 已完成 6 次咨询", next: "下次 6月8日 10:00" },
      { id: "zhou-nan", name: "周楠", code: "B12", completedCount: 3, meta: "暂停 · 已完成 3 次咨询", next: "最近 5月18日" },
    ],
    supervisor: [
      { id: "li-cheng", name: "李澄", code: "S03", completedCount: 3, meta: "督导师 · 已完成 3 次受督", next: "下次 6月9日 15:30" },
    ],
    supervisee: [
      { id: "zhou-ning", name: "周宁", code: "E12", completedCount: 12, meta: "受督者 · 已完成 12 次督导", next: "下次 6月12日 14:00" },
    ],
  };
  const archiveCandidates = filterArchiveCandidates(candidatesByKind[kind], searchQuery);
  const selectedCandidate = candidatesByKind[kind].find((item) => item.id === selectedProfile);
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
          <TextInput
            value={newProfileName}
            onChangeText={setNewProfileName}
            placeholder="姓名 / 称呼（必填）"
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
          />
          <TextInput
            value={newProfileNote}
            onChangeText={setNewProfileNote}
            placeholder={kind === "client" ? "主诉与目标（可稍后补充）" : kind === "supervisor" ? "督导方向（可稍后补充）" : "受督方向（可稍后补充）"}
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
              onNotice("新人员已创建并选中", `${newProfileName.trim()}的基础档案已创建，录音将作为第 1 次记录归档。`);
            }}
          >
            <Text style={styles.inlineCreateConfirmText}>保存人员并选中</Text>
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
        style={[styles.primaryButton, styles.wideButton, !pendingResult && styles.pendingPrimaryButton]}
        activeOpacity={0.78}
        onPress={() => {
          if (!pendingResult) {
            onNotice("请先选择归属档案", "保存录音后必须选择已有人员，或新增人员后再确认归档。");
            return;
          }
          onComplete(pendingResult);
        }}
      >
        <FolderOpen size={18} color="#FFF9F3" />
        <Text style={styles.primaryButtonText}>{pendingResult ? `归档到 ${pendingResult.profileName}` : "请先选择档案"}</Text>
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

      <SectionHeader title="后台处理中" action="自动更新" />
      <View style={styles.processingList}>
        <ProcessingRow title="原始录音" detail="已保存，13 天后自动销毁" status="完成" complete />
        <ProcessingRow title="完整转写" detail="识别发言人与时间戳" status="处理中" />
        <ProcessingRow title="录音纪要" detail="生成摘要与章节速览" status="等待中" />
        <ProcessingRow title={recordMaterialTitle} detail="将合并量表、作业和其他资料" status="待补充" />
      </View>

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
  onOpenDetail,
  onCreate,
}: {
  profiles: ProfileListItem[];
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
        {visibleProfiles.map((item) => (
          <TouchableOpacity key={item.id} style={styles.profileCard} activeOpacity={0.78} onPress={() => onOpenDetail(item)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.name} · {item.id}</Text>
              <Text style={styles.listMeta}>{item.count} · 下次 {item.next}</Text>
              <View style={styles.badgeRow}>
                <Badge label={item.status} tone="green" />
                <Badge label={`风险 ${item.risk}`} tone={item.risk === "轻度" ? "warm" : "blue"} />
              </View>
            </View>
            <LockKeyhole size={18} color={colors.subtle} />
          </TouchableOpacity>
        ))}
        {visibleProfiles.length === 0 ? (
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

function ProfileCreateScreen({
  onNotice,
  onCreate,
}: {
  onNotice: (title: string, detail: string) => void;
  onCreate: (profile: ProfileListItem) => void;
}) {
  const [kind, setKind] = useState<ArchiveKind>("client");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [primaryDetail, setPrimaryDetail] = useState("");
  const [secondaryDetail, setSecondaryDetail] = useState("");
  const [next, setNext] = useState("");
  const fieldCopy = {
    client: {
      primary: "联系方式（可选）",
      secondary: "主诉与来访目标（可选）",
      next: "下次咨询时间（可选）",
    },
    supervisor: {
      primary: "督导方向（可选）",
      secondary: "机构 / 资质（可选）",
      next: "下次受督时间（可选）",
    },
    supervisee: {
      primary: "受督方向（可选）",
      secondary: "当前阶段（可选）",
      next: "下次督导时间（可选）",
    },
  }[kind];
  const switchKind = (nextKind: ArchiveKind) => {
    setKind(nextKind);
    setName("");
    setCode("");
    setPrimaryDetail("");
    setSecondaryDetail("");
    setNext("");
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
        <TextInput value={name} onChangeText={setName} placeholder="姓名 / 称呼（必填）" placeholderTextColor={colors.subtle} style={styles.profileFormInput} />
        <TextInput value={code} onChangeText={setCode} placeholder="档案编号（可选，系统可自动生成）" placeholderTextColor={colors.subtle} style={styles.profileFormInput} />
        <TextInput value={primaryDetail} onChangeText={setPrimaryDetail} placeholder={fieldCopy.primary} placeholderTextColor={colors.subtle} style={styles.profileFormInput} />
        <TextInput value={secondaryDetail} onChangeText={setSecondaryDetail} placeholder={fieldCopy.secondary} placeholderTextColor={colors.subtle} style={[styles.profileFormInput, styles.profileFormArea]} multiline />
        <TextInput value={next} onChangeText={setNext} placeholder={fieldCopy.next} placeholderTextColor={colors.subtle} style={styles.profileFormInput} />
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>基础档案长期保存</Text>
        <Text style={styles.privacyCopy}>基础档案信息会长期保存在云端；录音、咨询记录、个案报告、附件等敏感资料仍按 14 天临时保存与主动授权规则处理。</Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, styles.wideButton, !name.trim() && styles.pendingPrimaryButton]}
        activeOpacity={0.78}
        onPress={() => {
          if (!name.trim()) {
            onNotice("请填写姓名", "姓名或称呼是创建档案的必要信息。");
            return;
          }
          const profile = buildNewProfile({ kind, name, next });
          onCreate({ ...profile, id: code.trim() || profile.id });
        }}
      >
        <FolderOpen size={18} color="#FFF9F3" />
        <Text style={styles.primaryButtonText}>{name.trim() ? "创建并进入档案" : "请先填写姓名"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ProfileDetailScreen({
  profile,
  sessions,
  legalFileNames,
  onSessionsChange,
  onLegalFilesChange,
  onOpenRecord,
  onOpenCaseReport,
  onOpenMaterial,
  onPreviewLegal,
  onNotice,
}: {
  profile: ArchiveResult;
  sessions: SessionHistoryItem[];
  legalFileNames: Record<string, string>;
  onSessionsChange: (sessions: SessionHistoryItem[]) => void;
  onLegalFilesChange: (files: Record<string, string>) => void;
  onOpenRecord: () => void;
  onOpenCaseReport: () => void;
  onOpenMaterial: (category: MaterialCategory, sessionId: string) => void;
  onPreviewLegal: (title: string, meta: string) => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const [showLegalUpload, setShowLegalUpload] = useState(false);
  const [legalUploadName, setLegalUploadName] = useState("");
  const [pendingLegalOverwrite, setPendingLegalOverwrite] = useState<string | null>(null);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newSessionTime, setNewSessionTime] = useState("2026-06-08 18:00");
  const [newSessionSummary, setNewSessionSummary] = useState("");
  const isDefaultProfile = profile.profileName === "陈雨";
  const hasRecords = profile.recordLabel !== "尚无记录";
  const sessionNoun = profile.kindLabel === "来访者" ? "咨询" : profile.kindLabel === "督导师" ? "受督" : "督导";
  const legalFiles = profile.kindLabel === "来访者"
    ? ["知情同意书", "咨询协议"]
    : profile.kindLabel === "督导师"
      ? ["督导协议", "督导评价"]
      : ["督导协议", "受督者评估"];
  const legalMetas = legalFiles.map((title, index) => legalFileNames[title] ?? (isDefaultProfile ? index === 0 ? "已签署 · 第 2 版" : "已签署 · 6月3日" : "待上传"));
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
          </View>
          <Badge label="已解锁" tone="green" />
        </View>
        <View style={styles.detailStats}>
          <MiniStat label="状态" value={isDefaultProfile ? "进行中" : hasRecords ? "处理中" : "新建"} />
          <MiniStat label="频率" value={isDefaultProfile ? "每周" : "未设置"} />
          <MiniStat label="下次" value={isDefaultProfile ? "6月8日" : "未设置"} />
        </View>
      </View>

      <SectionHeader title="法律及伦理文件" action={showLegalUpload ? "收起" : "上传"} onAction={() => setShowLegalUpload((current) => !current)} />
      {showLegalUpload ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>覆盖上传伦理文件</Text>
          <TextInput
            value={legalUploadName}
            onChangeText={setLegalUploadName}
            placeholder={`输入 ${legalFiles.join(" / ")} 文件名`}
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
          />
          <Text style={styles.formHelp}>同类文件只保留当前版本。已有文件时需要再次确认覆盖。</Text>
          <TouchableOpacity style={[styles.inlineCreateConfirm, !legalUploadName.trim() && styles.inlineCreateConfirmDisabled]} activeOpacity={0.78} onPress={() => {
            if (!legalUploadName.trim()) return;
            const target = legalFiles.find((item) => legalUploadName.includes(item)) ?? legalFiles[0];
            if ((isDefaultProfile || legalFileNames[target]) && legalFileNames[target] !== "已删除" && pendingLegalOverwrite !== target) {
              setPendingLegalOverwrite(target);
              onNotice("确认覆盖文件", `再次点击将用 ${legalUploadName.trim()} 覆盖现有${target}。`);
              return;
            }
            onLegalFilesChange({ ...legalFileNames, [target]: legalUploadName.trim() });
            setPendingLegalOverwrite(null);
            setLegalUploadName("");
            setShowLegalUpload(false);
            onNotice("伦理文件已更新", `${target}已替换为最新上传版本。`);
          }}>
            <Text style={styles.inlineCreateConfirmText}>{pendingLegalOverwrite ? "确认覆盖现有文件" : "上传并检查覆盖"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.legalGrid}>
        <LegalFile
          title={legalFiles[0]}
          meta={legalMetas[0]}
          icon={FileText}
          onPress={() => {
            if (legalMetas[0] === "待上传" || legalMetas[0] === "已删除") {
              setLegalUploadName(legalFiles[0]);
              setShowLegalUpload(true);
              return;
            }
            onPreviewLegal(legalFiles[0], `PDF · ${legalMetas[0]}`);
          }}
        />
        <LegalFile
          title={legalFiles[1]}
          meta={legalMetas[1]}
          icon={ClipboardList}
          onPress={() => {
            if (legalMetas[1] === "待上传" || legalMetas[1] === "已删除") {
              setLegalUploadName(legalFiles[1]);
              setShowLegalUpload(true);
              return;
            }
            onPreviewLegal(legalFiles[1], `PDF · ${legalMetas[1]}`);
          }}
        />
      </View>

      <SectionHeader title={`${sessionNoun}历程`} action={showCreateSession ? "收起" : "新增记录"} onAction={() => setShowCreateSession((current) => !current)} />
      {showCreateSession ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>新增{sessionNoun}记录</Text>
          <TextInput
            value={newSessionTime}
            onChangeText={setNewSessionTime}
            placeholder="日期时间，例如 2026-06-08 18:00"
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
          />
          <TextInput
            value={newSessionSummary}
            onChangeText={setNewSessionSummary}
            placeholder="本次摘要，可创建后继续修改"
            placeholderTextColor={colors.subtle}
            style={[styles.archiveTextInput, styles.archiveTextArea]}
            multiline
          />
          <TouchableOpacity style={styles.inlineCreateConfirm} activeOpacity={0.78} onPress={() => {
            const occurredAt = normalizeSessionDate(newSessionTime);
            if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
              onNotice("日期时间格式不正确", "请按 2026-06-08 18:00 的格式填写。");
              return;
            }
            const sequence = Math.max(0, ...sessions.map((session) => session.sequence)) + 1;
            onSessionsChange(sortSessionsDescending([...sessions, {
              id: `session-${sequence}`,
              sequence,
              occurredAt,
              summary: newSessionSummary.trim() || `尚未补充本次${sessionNoun}摘要。`,
              tags: ["待补充"],
              recording: "未添加",
              record: "未生成",
              scale: "未上传",
              homework: "未添加",
              other: "无",
            }]));
            setShowCreateSession(false);
            setNewSessionSummary("");
            onNotice(`已新增第 ${sequence} 次${sessionNoun}`, "咨询历程已按时间倒序重新排列。");
          }}>
            <Text style={styles.inlineCreateConfirmText}>创建记录</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {sessions.length > 0 ? sortSessionsDescending(sessions).map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          sessionNoun={sessionNoun}
          onChange={(patch) => onSessionsChange(updateSession(sessions, session.id, patch))}
          onDelete={() => onSessionsChange(removeSession(sessions, session.id))}
          onOpenRecord={onOpenRecord}
          onOpenMaterial={(category) => onOpenMaterial(category, session.id)}
          onNotice={onNotice}
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

      {profile.kindLabel === "来访者" && sessions.length > 0 ? (
        <PrimaryButton
          icon={Sparkles}
          label="生成个案报告"
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
  onRegenerated: () => void;
  onNotice: (title: string, detail: string) => void;
  onOpenPrivacy: () => void;
}) {
  const context = describeRecordingContext(recording.title);
  const [confirmRegeneration, setConfirmRegeneration] = useState(false);
  const [exportReady, setExportReady] = useState(false);
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

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>录音纪要</Text>
          <Badge label="可重新生成" tone="blue" />
        </View>
        <Text style={styles.summaryCopy}>{summary}</Text>
        {confirmRegeneration ? (
          <View style={styles.warningPanel}>
            <CircleAlert size={18} color={colors.danger} />
            <Text style={styles.warningText}>{regenerationWarning}</Text>
          </View>
        ) : null}
        <View style={styles.inlineActions}>
          <GhostButton icon={RefreshCcw} label={confirmRegeneration ? "确认覆盖并重新生成" : "重新生成"} onPress={() => {
            const decision = decideRecordingRegeneration(hasManualEdits, confirmRegeneration);
            if (decision.status === "confirm") {
              setConfirmRegeneration(true);
              return;
            }
            setConfirmRegeneration(false);
            onRegenerated();
          }} />
          <PrimaryButton icon={Edit3} label={context.actionLabel} onPress={onOpenRecord} />
        </View>
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
          <Text style={styles.speakerChip}>{context.roles[0]}：{context.roles[0] === "咨询师" ? "林咨询师" : recording.profileName ?? "待确认"}</Text>
          <Text style={styles.speakerChip}>{context.roles[1]}：{context.roles[1] === "咨询师" ? "林咨询师" : recording.profileName ?? "待确认"}</Text>
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
        <DataRow icon={Download} title="下载录音纪要 PDF" value={exportReady ? "已下载 · 可重新下载" : "包含纪要、章节与完整转写"} onPress={() => {
          setExportReady(true);
          scheduleDownload(buildDownloadArtifact({
            title: `${recording.title} 录音纪要`,
            fileType: "PDF",
            sections: [
              { title: "录音纪要", content: summary },
              { title: "章节速览", content: chapters.map((chapter) => `${chapter.time} ${chapter.title}`).join("\n") },
              { title: "完整转写", content: turns.map((turn) => `${turn.time} ${turn.speaker}\n${turn.text}`).join("\n\n") },
            ],
          }));
          onNotice("下载已开始", "PDF 包含当前纪要、章节和完整转写，不包含原始录音。");
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
  onSave: () => void;
}) {
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
      <PrimaryButton icon={Save} label="保存章节修改" onPress={onSave} wide />
    </View>
  );
}

function TranscriptEditorScreen({
  turns,
  onChange,
  onSave,
}: {
  turns: EditableTranscriptTurn[];
  onChange: (index: number, turn: EditableTranscriptTurn) => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.stack}>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>逐段校对发言人与文本</Text>
        <Text style={styles.privacyCopy}>保存后会标记为人工修改。重新生成纪要前必须确认是否覆盖这些修改。</Text>
      </View>
      {turns.map((turn, index) => (
        <View key={`${turn.time}-${index}`} style={styles.editSection}>
          <View style={styles.twoColumnInputs}>
            <TextInput
              value={turn.time}
              onChangeText={(time) => onChange(index, { ...turn, time })}
              style={[styles.profileFormInput, styles.compactInput]}
            />
            <TextInput
              value={turn.speaker}
              onChangeText={(speaker) => onChange(index, { ...turn, speaker })}
              style={[styles.profileFormInput, styles.flexInput]}
            />
          </View>
          <TextInput
            value={turn.text}
            onChangeText={(text) => onChange(index, { ...turn, text })}
            multiline
            style={[styles.profileFormInput, styles.profileFormArea]}
          />
        </View>
      ))}
      <PrimaryButton icon={Save} label="保存完整转写" onPress={onSave} wide />
    </View>
  );
}

function SessionMaterialsScreen({
  category,
  materials,
  onOpenRecording,
  onPreview,
  onAdd,
  onAuthorize,
}: {
  category: MaterialCategory;
  materials: SessionMaterial[];
  onOpenRecording: () => void;
  onPreview: (material: SessionMaterial) => void;
  onAdd: (title: string, fileType: string) => void;
  onAuthorize: () => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [fileType, setFileType] = useState(category === "recording" ? "音频" : category === "homework" || category === "other" ? "PDF" : "图片");
  const copy = materialCategoryCopy[category];

  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        {category === "recording" ? <Mic size={25} color={colors.clayDark} /> : <Upload size={25} color={colors.clayDark} />}
        <Text style={styles.posterTitle}>{copy.title}</Text>
        <Text style={styles.posterCopy}>{category === "recording" ? "原始录音仅临时保存 14 天；转写与纪要可单独授权。" : "新增资料会参与下一次生成本次记录，但不会自动覆盖已有草稿或正式版。"}</Text>
      </View>

      <SectionHeader title={`当前资料 · ${materials.length} 项`} action={showUpload ? "收起" : copy.uploadLabel} onAction={() => setShowUpload((current) => !current)} />
      {showUpload ? (
        <View style={styles.inlineCreateCard}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={category === "recording" ? "录音文件名" : "资料名称"}
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
          />
          <View style={styles.segmented}>
            {(category === "recording" ? ["音频"] : category === "homework" || category === "other" ? ["PDF", "图片", "文字备注"] : ["PDF", "图片"]).map((type) => (
              <TouchableOpacity key={type} style={[styles.segmentButton, fileType === type && styles.segmentActive]} onPress={() => setFileType(type)}>
                <Text style={[styles.segmentText, fileType === type && styles.segmentTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.inlineCreateConfirm, !title.trim() && styles.inlineCreateConfirmDisabled]} activeOpacity={0.78} onPress={() => {
            if (!title.trim()) return;
            onAdd(title, fileType);
            setTitle("");
            setShowUpload(false);
          }}>
            <Text style={styles.inlineCreateConfirmText}>确认添加</Text>
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
                <Text style={styles.listTitle}>{material.title}</Text>
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
    </View>
  );
}

function FilePreviewScreen({
  file,
  onUpdate,
  onDelete,
}: {
  file: PreviewFile;
  onUpdate: (title: string, fileType: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(file.title);
  const [fileType, setFileType] = useState(file.fileType);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const previewCopy = fileType === "图片"
    ? "图片预览区域"
    : fileType === "音频"
      ? "音频波形与播放区域"
      : fileType === "文字备注"
        ? "文字内容预览区域"
        : "PDF 文档预览区域";

  return (
    <View style={styles.stack}>
      <View style={styles.filePreviewCanvas}>
        <View style={styles.filePreviewIcon}>
          {fileType === "图片" ? <Eye size={30} color={colors.clayDark} /> : <FileText size={30} color={colors.clayDark} />}
        </View>
        <Text style={styles.filePreviewTitle}>{file.title}</Text>
        <Text style={styles.filePreviewMeta}>{file.meta}</Text>
        <Text style={styles.filePreviewPlaceholder}>{previewCopy}</Text>
      </View>

      {editing ? (
        <View style={styles.inlineCreateCard}>
          <Text style={styles.formPreviewTitle}>修改文件</Text>
          <TextInput value={title} onChangeText={setTitle} style={styles.archiveTextInput} />
          <View style={styles.segmented}>
            {["PDF", "图片", "文字备注"].map((type) => (
              <TouchableOpacity key={type} style={[styles.segmentButton, fileType === type && styles.segmentActive]} onPress={() => setFileType(type)}>
                <Text style={[styles.segmentText, fileType === type && styles.segmentTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PrimaryButton icon={Save} label="保存修改 / 替换文件" onPress={() => {
            if (!title.trim()) return;
            onUpdate(title.trim(), fileType);
            setEditing(false);
          }} wide />
        </View>
      ) : null}

      <View style={styles.fileActionStack}>
        {fileType === "PDF" ? <GhostButton icon={Download} label={downloaded ? "重新下载 PDF" : "下载 PDF"} onPress={() => {
          setDownloaded(true);
          scheduleDownload(buildDownloadArtifact({
            title: file.title,
            fileType: "PDF",
            sections: [{ title: "文件信息", content: file.meta }],
          }));
        }} /> : null}
        <GhostButton icon={Edit3} label={editing ? "取消修改" : "修改 / 替换"} onPress={() => {
          setEditing((current) => !current);
          setConfirmDelete(false);
        }} />
        <TouchableOpacity style={[styles.dangerButton, styles.flexActionButton]} activeOpacity={0.78} onPress={() => {
          if (!confirmDelete) {
            setConfirmDelete(true);
            return;
          }
          onDelete();
        }}>
          <Trash2 size={16} color={colors.danger} />
          <Text style={styles.dangerButtonText}>{confirmDelete ? "确认删除文件" : "删除文件"}</Text>
        </TouchableOpacity>
      </View>
      {confirmDelete ? (
        <View style={styles.warningPanel}>
          <CircleAlert size={18} color={colors.danger} />
          <Text style={styles.warningText}>删除后会从本次咨询材料中移除，已有引用只保留“文件已删除”状态。</Text>
        </View>
      ) : null}
    </View>
  );
}

function RecordEditorScreen({
  profile,
  sections,
  formal,
  dirty,
  onSectionsChange,
  onFormalChange,
  onDirtyChange,
  onOpenPrivacy,
  onNotice,
}: {
  profile: ArchiveResult;
  sections: EditableRecordSection[];
  formal: boolean;
  dirty: boolean;
  onSectionsChange: (sections: EditableRecordSection[]) => void;
  onFormalChange: (formal: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onOpenPrivacy: () => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const recordType = getRecordType(profile.kindLabel);
  return (
    <View style={styles.stack}>
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.editorEyebrow}>{recordType}{formal ? "正式版" : "草稿"}</Text>
          <Text style={styles.editorTitle}>{profile.profileName} · {profile.recordLabel}</Text>
        </View>
        <Badge label={formal ? "正式版" : "草稿"} tone={formal ? "green" : "warm"} />
      </View>
      <View style={styles.ruleCard}>
        <CircleAlert size={19} color={colors.clayDark} />
        <Text style={styles.ruleText}>正式版不能直接编辑。保存正式版前，请确认草稿内容；后续修改会先复制为草稿再替换正式版。</Text>
      </View>

      <View style={styles.editorToolbar}>
        <GhostButton icon={History} label="草稿" onPress={() => onNotice("草稿状态", formal ? "当前正在查看正式版，需先复制为草稿才能继续编辑。" : "当前草稿可继续编辑，保存后会成为正式版。")} />
        <GhostButton icon={FileText} label="正式版" onPress={() => onNotice("正式版状态", formal ? "当前正式版已保存，不可直接编辑。" : "当前还没有正式版，先确认草稿内容并保存。")} />
      </View>

      <View style={styles.editorStatusGrid}>
        <MiniStat label="编辑段落" value="3 段" />
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
          <PrimaryButton icon={Edit3} label="复制为草稿继续修改" onPress={() => {
            onFormalChange(false);
            onDirtyChange(false);
            onNotice("已复制为草稿", "正式版保持不变；保存草稿后可替换正式版。");
          }} wide />
        ) : (
          <PrimaryButton icon={Save} label="保存为正式版" onPress={() => {
            onFormalChange(true);
            onDirtyChange(false);
            onNotice(`${recordType}已保存为正式版`, `本次${recordType}已进入档案；后续修改需先复制为草稿。`);
          }} wide />
        )}
        <GhostButton icon={Download} label={`下载${recordType} PDF`} onPress={() => {
          scheduleDownload(buildDownloadArtifact({
            title: `${profile.profileName} ${profile.recordLabel} ${recordType}`,
            fileType: "PDF",
            sections,
          }));
          onNotice("下载已开始", `${recordType}${formal ? "正式版" : "草稿"}正在下载到本地。`);
        }} />
        <GhostButton icon={ShieldCheck} label="授权长期保存草稿与正式版" onPress={onOpenPrivacy} />
      </View>
    </View>
  );
}

function CaseReportMaterialScreen({
  profile,
  onGenerate,
}: {
  profile: ArchiveResult;
  onGenerate: () => void;
}) {
  const materials: CaseReportMaterial[] = [
    { id: "record-6", title: "第 6 次咨询记录 · 草稿", available: true },
    { id: "record-5", title: "第 5 次咨询记录 · 正式版", available: true },
    { id: "scale-5", title: "第 5 次 SAS 量表", available: true },
    { id: "homework-5", title: "第 5 次咨询作业", available: true },
    { id: "audio-4", title: "第 4 次原始录音 · 已销毁", available: false },
  ];
  const selectable = getSelectableCaseReportMaterials(materials);
  const [selected, setSelected] = useState(selectable.map((item) => item.id));
  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
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
        <Text style={styles.privacyCopy}>默认勾选所有仍可用的咨询记录、量表、作业和附件。已销毁资料不能参与分析。</Text>
      </View>
      <View style={styles.consentList}>
        {materials.map((material) => material.available ? (
          <ConsentItem
            key={material.id}
            title={material.title}
            meta="可参与个案报告生成"
            selected={selected.includes(material.id)}
            onPress={() => toggle(material.id)}
          />
        ) : (
          <View key={material.id} style={styles.lockedConsentItem}>
            <Trash2 size={18} color={colors.danger} />
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{material.title}</Text>
              <Text style={styles.listMeta}>资料已销毁，无法纳入分析</Text>
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.primaryButton, styles.wideButton, selected.length === 0 && styles.pendingPrimaryButton]}
        activeOpacity={0.78}
        disabled={selected.length === 0}
        onPress={onGenerate}
      >
        <Sparkles size={18} color="#FFF9F3" />
        <Text style={styles.primaryButtonText}>{selected.length > 0 ? `使用 ${selected.length} 项资料生成草稿` : "至少选择一项资料"}</Text>
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
  onOpenPrivacy,
  onNotice,
}: {
  profile: ArchiveResult;
  sections: EditableRecordSection[];
  formal: boolean;
  onSectionsChange: (sections: EditableRecordSection[]) => void;
  onFormalChange: (formal: boolean) => void;
  onOpenPrivacy: () => void;
  onNotice: (title: string, detail: string) => void;
}) {
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
          <PrimaryButton icon={Edit3} label="复制为草稿继续修改" onPress={() => onFormalChange(false)} wide />
        ) : (
          <PrimaryButton icon={Save} label="保存个案报告正式版" onPress={() => {
            onFormalChange(true);
            onNotice("个案报告已保存为正式版", "正式版已进入档案，后续修改需要先复制为草稿。");
          }} wide />
        )}
        <GhostButton icon={Download} label="下载个案报告 PDF" onPress={() => {
          scheduleDownload(buildDownloadArtifact({
            title: `${profile.profileName} 个案报告`,
            fileType: "PDF",
            sections,
          }));
          onNotice("下载已开始", `个案报告${formal ? "正式版" : "草稿"}正在下载到本地，不包含原始录音。`);
        }} />
        <GhostButton icon={ShieldCheck} label="授权长期保存个案报告" onPress={onOpenPrivacy} />
      </View>
    </View>
  );
}

function PrivacyCenterScreen({
  authorizedResources,
  onAuthorize,
  onNotice,
}: {
  authorizedResources: string[];
  onAuthorize: () => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const expiringResources = privacyResources.filter((resource) => !authorizedResources.includes(resource.title));
  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        <ShieldCheck size={25} color={colors.sageDark} />
        <Text style={styles.posterTitle}>云端敏感资料默认保存 14 天</Text>
        <Text style={styles.posterCopy}>原始录音到期自动销毁且不能长期保存；其他敏感资料只有在你主动授权后才会长期保留。</Text>
      </View>

      <SectionHeader title="即将销毁资料" action={`${expiringResources.length} 项`} />
      <View style={styles.cardStack}>
        {expiringResources.map((item) => (
          <View key={item.title} style={styles.privacyResource}>
            <Clock3 size={18} color={item.preservable ? colors.clayDark : colors.danger} />
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listMeta}>{item.type} · {item.expires}</Text>
            </View>
            <Badge label={item.preservable ? "可授权" : "不可授权"} tone={item.preservable ? "warm" : "blue"} />
          </View>
        ))}
      </View>
      {getAuthorizableResources(expiringResources).length > 0 ? (
        <PrimaryButton icon={ShieldCheck} label="选择资料长期保存" onPress={onAuthorize} wide />
      ) : null}

      <SectionHeader title="已长期保存资料" action={`${authorizedResources.length} 项`} />
      {authorizedResources.length > 0 ? (
        <View style={styles.cardStack}>
          {authorizedResources.map((title) => (
            <TouchableOpacity key={title} style={styles.privacyResource} activeOpacity={0.78} onPress={() => onNotice("长期保存资料", `${title} 可在详情中撤回授权或立即删除。`)}>
              <CheckCircle2 size={18} color={colors.sageDark} />
              <View style={styles.listBody}>
                <Text style={styles.listTitle}>{title}</Text>
                <Text style={styles.listMeta}>保存至主动删除或撤回授权</Text>
              </View>
              <ChevronRight size={18} color={colors.subtle} />
            </TouchableOpacity>
          ))}
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

function PrivacyConsentScreen({
  resources,
  onCancel,
  onComplete,
}: {
  resources: PrivacyResource[];
  onCancel: () => void;
  onComplete: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggleConsent = (title: string) => {
    setSelected((current) => (current.includes(title) ? current.filter((item) => item !== title) : [...current, title]));
  };
  const hasSelected = selected.length > 0;

  return (
    <View style={styles.consentBackdrop}>
      <View style={styles.consentSheet}>
        <View style={styles.consentTopHandle} />
        <Text style={styles.consentTitle}>是否授权长期保存？</Text>
        <Text style={styles.consentCopy}>
          以下资料默认 14 天后销毁。长期保存需要你主动勾选，授权后会保存到云端，直到你删除资料或撤回授权。
        </Text>

        <View style={styles.consentList}>
          {resources.map((resource) => (
            <ConsentItem
              key={resource.title}
              title={resource.title}
              meta={`${resource.type} · ${resource.expires}`}
              selected={selected.includes(resource.title)}
              onPress={() => toggleConsent(resource.title)}
            />
          ))}
          <View style={styles.lockedConsentItem}>
            <Trash2 size={18} color={colors.danger} />
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>原始录音</Text>
              <Text style={styles.listMeta}>仅临时保存 14 天，不支持长期云端保存</Text>
            </View>
          </View>
        </View>

        <View style={styles.riskPanel}>
          <ShieldCheck size={18} color={colors.sageDark} />
          <Text style={styles.riskText}>
            {hasSelected ? `将授权 ${selected.length} 项资料长期保存。` : "尚未选择任何资料。"}
            你可以在「数据与隐私」中随时查看授权清单、取消授权或删除资料。
          </Text>
        </View>

        <View style={styles.consentFooter}>
          <TouchableOpacity style={styles.secondaryWideButton} activeOpacity={0.78} onPress={onCancel}>
            <Text style={styles.secondaryWideText}>暂不授权</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.disabledWideButton, hasSelected && styles.enabledWideButton]}
            activeOpacity={0.78}
            disabled={!hasSelected}
            onPress={() => onComplete(selected)}
          >
            <Text style={[styles.disabledWideText, hasSelected && styles.enabledWideText]}>{hasSelected ? `确认授权 ${selected.length} 项` : "需手动勾选"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function SupervisionScreen() {
  const contextOptions: SupervisionContext[] = [
    { id: "record-6", title: "陈雨 第6次咨询记录", type: "咨询记录" },
    { id: "scale-6", title: "陈雨 SAS 量表", type: "量表" },
    { id: "report-chen", title: "陈雨 个案报告草稿", type: "个案报告" },
  ];
  const [showContexts, setShowContexts] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [selectedContexts, setSelectedContexts] = useState<SupervisionContext[]>([]);
  const [input, setInput] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [generating, setGenerating] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; align: "left" | "right"; text: string; citations?: string[] }>>([
    { id: "intro-user", align: "left", text: "可以帮我整理一个适合带去督导的问题清单吗？" },
    { id: "intro-ai", align: "right", text: "可以。先选择本次允许读取的资料；未添加资料时，我只提供通用整理框架。" },
  ]);

  useEffect(() => {
    if (!generating || !pendingQuestion) return;
    const timeout = setTimeout(() => {
      const reply = buildSupervisionReply(pendingQuestion, selectedContexts);
      setMessages((current) => [...current, {
        id: `assistant-${current.length}`,
        align: "right",
        text: reply.text,
        citations: reply.citations,
      }]);
      setGenerating(false);
      setPendingQuestion("");
    }, 8000);
    return () => clearTimeout(timeout);
  }, [generating, pendingQuestion, selectedContexts]);

  const toggleContext = (context: SupervisionContext) => {
    setSelectedContexts((current) => current.some((item) => item.id === context.id)
      ? current.filter((item) => item.id !== context.id)
      : [...current, context]);
  };

  return (
    <View style={styles.stack}>
      <View style={styles.aiPanel}>
        <Sparkles size={24} color={colors.clayDark} />
        <Text style={styles.aiTitle}>{selectedContexts.length > 0 ? `已添加 ${selectedContexts.length} 项资料` : "本次会话未添加资料"}</Text>
        <Text style={styles.aiCopy}>{selectedContexts.length > 0 ? "AI 仅可读取下方勾选资料，回答会逐项显示引用来源。" : "AI 不会读取任何档案内容。添加资料后，回答会显示引用来源。"}</Text>
        <View style={styles.inlineActions}>
          <GhostButton icon={Plus} label={showContexts ? "收起资料" : "添加资料"} onPress={() => setShowContexts((current) => !current)} />
          <GhostButton icon={History} label={showConversations ? "返回会话" : "会话列表"} onPress={() => setShowConversations((current) => !current)} />
        </View>
      </View>

      {showContexts ? (
        <View style={styles.consentList}>
          {contextOptions.map((context) => (
            <ConsentItem
              key={context.id}
              title={context.title}
              meta={`${context.type} · 仅用于本次会话`}
              selected={selectedContexts.some((item) => item.id === context.id)}
              onPress={() => toggleContext(context)}
            />
          ))}
        </View>
      ) : null}

      {showConversations ? (
        <View style={styles.cardStack}>
          <TouchableOpacity style={styles.listCard} activeOpacity={0.78} onPress={() => setShowConversations(false)}>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>当前会话 · 督导问题整理</Text>
              <Text style={styles.listMeta}>{messages.length} 条消息 · {selectedContexts.length} 项资料</Text>
            </View>
            <Badge label="进行中" tone="green" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.listCard} activeOpacity={0.78} onPress={() => {
            setMessages([
              { id: "old-user", align: "left", text: "怎么区分关系反应和技术选择？" },
              { id: "old-ai", align: "right", text: "可以先标记咨询现场发生的事实，再分别写下你的情绪反应与技术意图。", citations: ["咨询记录：陈雨 第5次咨询记录"] },
            ]);
            setShowConversations(false);
          }}>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>陈雨咨询复盘</Text>
              <Text style={styles.listMeta}>6月3日 · 已授权长期保存</Text>
            </View>
            <ChevronRight size={18} color={colors.subtle} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {messages.map((message) => (
            <View key={message.id} style={styles.chatMessageGroup}>
              <ChatBubble align={message.align} text={message.text} />
              {message.citations && message.citations.length > 0 ? (
                <View style={styles.citationPanel}>
                  <Text style={styles.citationTitle}>引用来源</Text>
                  {message.citations.map((citation) => <Text key={citation} style={styles.citationText}>{citation}</Text>)}
                </View>
              ) : null}
            </View>
          ))}
          {generating ? (
            <View style={styles.processingChat}>
              <RefreshCcw size={17} color={colors.clayDark} />
              <Text style={styles.listMeta}>正在基于 {selectedContexts.length} 项已选资料生成回答</Text>
              <TouchableOpacity style={styles.stopButton} activeOpacity={0.78} onPress={() => {
                setGenerating(false);
                setPendingQuestion("");
                setMessages((current) => [...current, { id: `stopped-${current.length}`, align: "right", text: "生成已停止，本次未完成回答未保存。" }]);
              }}>
                <Square size={14} color={colors.danger} fill={colors.danger} />
                <Text style={styles.stopButtonText}>停止</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
      <View style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          editable={!generating}
          placeholder="输入想讨论的主题"
          placeholderTextColor={colors.subtle}
          style={styles.composerInput}
        />
        <TouchableOpacity accessibilityLabel="发送督导问题" style={[styles.sendButton, (!input.trim() || generating) && styles.sendButtonDisabled]} activeOpacity={0.75} disabled={!input.trim() || generating} onPress={() => {
          const question = input.trim();
          setMessages((current) => [...current, { id: `user-${current.length}`, align: "left", text: question }]);
          setPendingQuestion(question);
          setInput("");
          setGenerating(true);
          setShowConversations(false);
        }}>
          <Play size={17} color="#FFF9F3" fill="#FFF9F3" />
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

function AccountScreen({
  onOpenPrivacy,
  onOpenSecurity,
  onNotice,
}: {
  onOpenPrivacy: () => void;
  onOpenSecurity: () => void;
  onNotice: (title: string, detail: string) => void;
}) {
  return (
    <View style={styles.stack}>
      <TouchableOpacity style={styles.accountCard} activeOpacity={0.78} onPress={() => onNotice("个人资料", "可编辑展示身份、专业方向和账号资料；身份展示不影响功能权限。")}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>林</Text>
        </View>
        <View style={styles.listBody}>
          <Text style={styles.accountName}>林咨询师</Text>
          <Text style={styles.listMeta}>心理咨询师 · 个人版</Text>
        </View>
        <Settings size={20} color={colors.subtle} />
      </TouchableOpacity>
      <SectionHeader title="数据与隐私" action="查看" onAction={onOpenPrivacy} />
      <View style={styles.cardStack}>
        {privacyResources.map((item) => (
          <TouchableOpacity key={item.title} style={styles.privacyResource} activeOpacity={0.78} onPress={onOpenPrivacy}>
            <Clock3 size={18} color={item.preservable ? colors.sageDark : colors.danger} />
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listMeta}>{item.type} · {item.expires}</Text>
            </View>
            <Badge label={item.preservable ? "可授权" : "不可长期"} tone={item.preservable ? "green" : "warm"} />
          </TouchableOpacity>
        ))}
      </View>
      <SectionHeader title="安全" action="设置" onAction={onOpenSecurity} />
      <View style={styles.settingsList}>
        <SettingsRow icon={LockKeyhole} title="档案访问密码" value="三类档案独立设置" onPress={onOpenSecurity} />
        <SettingsRow icon={CalendarDays} title="手机日历同步" value="隐私标题模式关闭" onPress={onOpenSecurity} />
        <SettingsRow icon={ShieldCheck} title="账号安全" value="邮箱登录" onPress={onOpenSecurity} />
      </View>
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

function StatisticsScreen() {
  const rows = [
    { title: "咨询", value: "7.5 小时", detail: "6 次 · 较上周 +1.0 小时" },
    { title: "接受督导", value: "2.0 小时", detail: "2 次 · 已完成记录" },
    { title: "提供督导", value: "1.5 小时", detail: "1 次 · 正式版待保存" },
  ];
  return (
    <View style={styles.stack}>
      <View style={styles.metricSummary}>
        <Text style={styles.metricSummaryLabel}>2026年6月1日 - 6月7日</Text>
        <Text style={styles.metricSummaryValue}>11.0h</Text>
        <Text style={styles.metricSummaryCopy}>本周专业工作总时长</Text>
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
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>统计口径</Text>
        <Text style={styles.privacyCopy}>按已完成并归档的录音时长统计；未归档录音和已取消日程不计入。</Text>
      </View>
    </View>
  );
}

function ScheduleScreen({ onStartRecording }: { onStartRecording: () => void }) {
  const [selectedDay, setSelectedDay] = useState("周一 6/8");
  const [privacyTitles, setPrivacyTitles] = useState(true);
  const days = ["周一 6/8", "周二 6/9", "周三 6/10", "周四 6/11", "周五 6/12"];
  const scheduleRows = selectedDay === "周一 6/8"
    ? [
        { time: "10:00", title: privacyTitles ? "个人安排" : "陈雨 · 第7次咨询", kind: "咨询 · 50 分钟" },
        { time: "15:30", title: privacyTitles ? "专业安排" : "李澄 · 第4次受督", kind: "受督 · 60 分钟" },
      ]
    : [{ time: "14:00", title: privacyTitles ? "专业安排" : "周宁 · 第13次督导", kind: "督导 · 60 分钟" }];
  return (
    <View style={styles.stack}>
      <View style={styles.segmentedScroll}>
        {days.map((day) => (
          <TouchableOpacity key={day} style={[styles.dayButton, selectedDay === day && styles.dayButtonActive]} onPress={() => setSelectedDay(day)}>
            <Text style={[styles.dayButtonText, selectedDay === day && styles.dayButtonTextActive]}>{day}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ToggleRow
        title="隐私标题模式"
        detail="同步到手机日历和锁屏时隐藏姓名与档案信息"
        enabled={privacyTitles}
        onPress={() => setPrivacyTitles((current) => !current)}
      />
      <SectionHeader title={selectedDay} action={`${scheduleRows.length} 项`} />
      <View style={styles.cardStack}>
        {scheduleRows.map((item) => (
          <View key={`${item.time}-${item.title}`} style={styles.listCard}>
            <View style={styles.timePill}><Text style={styles.timePillText}>{item.time}</Text></View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listMeta}>{item.kind}</Text>
            </View>
            {item.time === "10:00" ? (
              <TouchableOpacity style={styles.smallActionButton} onPress={onStartRecording}>
                <Mic size={15} color={colors.clayDark} />
                <Text style={styles.smallActionText}>录音</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function SecuritySettingsScreen({ onNotice }: { onNotice: (title: string, detail: string) => void }) {
  const [calendarSync, setCalendarSync] = useState(true);
  const [privacyTitle, setPrivacyTitle] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [passwords, setPasswords] = useState({ client: "已设置", supervisor: "未设置", supervisee: "未设置" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <View style={styles.stack}>
      <SectionHeader title="档案访问密码" />
      <View style={styles.settingsList}>
        {([
          ["client", "来访者档案"],
          ["supervisor", "督导师档案"],
          ["supervisee", "受督者档案"],
        ] as const).map(([key, label]) => (
          <SettingsRow key={key} icon={LockKeyhole} title={label} value={passwords[key]} onPress={() => {
            setPasswords((current) => ({ ...current, [key]: current[key] === "已设置" ? "已更新" : "已设置" }));
            onNotice("访问密码已更新", `${label}会在每次进入详情时单独验证。`);
          }} />
        ))}
      </View>

      <SectionHeader title="日历与登录" />
      <View style={styles.settingsList}>
        <ToggleRow title="手机日历同步" detail="把 App 日程同步到系统日历" enabled={calendarSync} onPress={() => setCalendarSync((current) => !current)} />
        <ToggleRow title="隐私标题模式" detail="系统日历与锁屏仅显示“个人安排”" enabled={privacyTitle} onPress={() => setPrivacyTitle((current) => !current)} />
        <ToggleRow title="新设备登录提醒" detail="新设备登录时发送邮箱提醒" enabled={loginAlerts} onPress={() => setLoginAlerts((current) => !current)} />
      </View>

      <SectionHeader title="账号与资料" />
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>删除全部云端资料</Text>
        <Text style={styles.dangerCopy}>将立即删除档案、记录、附件和会话，且不可恢复。原始录音也会立即销毁。</Text>
        {confirmDelete ? <Text style={styles.warningText}>再次点击确认删除。原始录音和已过期授权资料无法恢复。</Text> : null}
        <TouchableOpacity style={styles.dangerButton} activeOpacity={0.78} onPress={() => {
          if (!confirmDelete) {
            setConfirmDelete(true);
            return;
          }
          setConfirmDelete(false);
          onNotice("演示环境未执行删除", "真实环境会要求再次验证账号并显示不可恢复清单。");
        }}>
          <Trash2 size={16} color={colors.danger} />
          <Text style={styles.dangerButtonText}>{confirmDelete ? "确认永久删除" : "删除全部云端资料"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ToggleRow({ title, detail, enabled, onPress }: { title: string; detail: string; enabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.toggleRow} activeOpacity={0.78} onPress={onPress}>
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
        <Text style={styles.sectionAction}>{action}</Text>
      ) : null}
    </View>
  );
}

function PrimaryButton({ icon: Icon, label, onPress, wide }: { icon: typeof Mic; label: string; onPress: () => void; wide?: boolean }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, wide && styles.wideButton]} activeOpacity={0.78} onPress={onPress}>
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

function ActionNotice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
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

function SessionCard({
  session,
  sessionNoun,
  onChange,
  onDelete,
  onOpenRecord,
  onOpenMaterial,
  onNotice,
}: {
  session: SessionHistoryItem;
  sessionNoun: string;
  onChange: (patch: Partial<Omit<SessionHistoryItem, "id">>) => void;
  onDelete: () => void;
  onOpenRecord: () => void;
  onOpenMaterial: (category: MaterialCategory) => void;
  onNotice: (title: string, detail: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [timeDraft, setTimeDraft] = useState(session.occurredAt.slice(0, 16).replace("T", " "));
  const [summaryDraft, setSummaryDraft] = useState(session.summary);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const recordActionLabel = session.record === "未生成" || session.record === "待生成"
    ? `生成${sessionNoun}记录`
    : session.record === "正式版"
      ? `查看${sessionNoun}记录`
      : `查看/编辑${sessionNoun}记录`;
  const saveEdit = () => {
    const occurredAt = normalizeSessionDate(timeDraft);
    if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
      onNotice("日期时间格式不正确", "请按 2026-06-08 18:00 的格式填写。");
      return;
    }
    onChange({ occurredAt, summary: summaryDraft.trim() || session.summary });
    setEditing(false);
    onNotice("记录摘要已更新", "咨询历程已按时间倒序重新排列。");
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
        <TouchableOpacity style={styles.sessionToolButton} activeOpacity={0.78} onPress={() => {
          setEditing((current) => !current);
          setConfirmDelete(false);
        }}>
          <Edit3 size={14} color={colors.clayDark} />
          <Text style={styles.sessionToolText}>{editing ? "收起编辑" : "编辑摘要"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sessionToolButton, confirmDelete && styles.sessionToolButtonDanger]} activeOpacity={0.78} onPress={() => {
          if (!confirmDelete) {
            setConfirmDelete(true);
            return;
          }
          onDelete();
        }}>
          <Trash2 size={14} color={confirmDelete ? colors.danger : colors.clayDark} />
          <Text style={[styles.sessionToolText, confirmDelete && styles.sessionToolTextDanger]}>{confirmDelete ? "确认删除" : "删除"}</Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        <View style={styles.sessionEditPanel}>
          <TextInput
            value={timeDraft}
            onChangeText={setTimeDraft}
            placeholder="日期时间，例如 2026-06-08 18:00"
            placeholderTextColor={colors.subtle}
            style={styles.archiveTextInput}
          />
          <TextInput
            value={summaryDraft}
            onChangeText={setSummaryDraft}
            multiline
            style={[styles.archiveTextInput, styles.archiveTextArea]}
          />
          <View style={styles.tagEditRow}>
            {session.tags.map((tag) => (
              <TouchableOpacity key={tag} style={styles.editableTag} activeOpacity={0.78} onPress={() => onChange({ tags: session.tags.filter((item) => item !== tag) })}>
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
              onChange({ tags: nextTags });
              setTagDraft("");
            }}>
              <Plus size={15} color={colors.clayDark} />
              <Text style={styles.smallActionText}>添加</Text>
            </TouchableOpacity>
          </View>
          <PrimaryButton icon={Save} label="保存摘要与标签" onPress={saveEdit} wide />
        </View>
      ) : null}

      <View style={styles.sessionActionGrid}>
        <SessionAction icon={Mic} label="录音" status={session.recording} tone={session.recording.includes("剩余") ? "warm" : "muted"} onPress={() => onOpenMaterial("recording")} />
        <SessionAction icon={Edit3} label="记录" status={session.record} tone={session.record === "草稿" ? "blue" : session.record === "正式版" ? "green" : "muted"} onPress={onOpenRecord} />
        <SessionAction icon={ChartNoAxesColumn} label="量表" status={session.scale} tone={session.scale === "未上传" ? "muted" : "green"} onPress={() => onOpenMaterial("scale")} />
        <SessionAction icon={ClipboardList} label="作业" status={session.homework} tone={session.homework.includes("已") ? "green" : "muted"} onPress={() => onOpenMaterial("homework")} />
        <SessionAction icon={Plus} label="其他" status={session.other} tone={session.other === "无" ? "muted" : "blue"} onPress={() => onOpenMaterial("other")} />
      </View>

      <View style={styles.sessionFooter}>
        <Text style={styles.sessionRule}>记录可存草稿/正式版；敏感资料需主动授权长期保存</Text>
        <TouchableOpacity style={styles.sessionGenerateButton} activeOpacity={0.78} onPress={onOpenRecord}>
          {session.record === "未生成" || session.record === "待生成" ? <Sparkles size={16} color={colors.clayDark} /> : <Eye size={16} color={colors.clayDark} />}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function ProcessingRow({ title, detail, status, complete }: { title: string; detail: string; status: string; complete?: boolean }) {
  return (
    <View style={styles.processingRow}>
      <View style={[styles.processingDot, complete && styles.processingDotComplete]}>
        {complete ? <CheckCircle2 size={15} color="#FFF9F3" /> : <Clock3 size={14} color={colors.clayDark} />}
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{detail}</Text>
      </View>
      <Badge label={status} tone={complete ? "green" : "blue"} />
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
    fontWeight: "800",
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
    fontWeight: "800",
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
    fontWeight: "900",
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
    minHeight: 42,
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
    fontWeight: "900",
  },
  ghostButton: {
    minHeight: 42,
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
    fontWeight: "800",
  },
  quickGrid: {
    flexDirection: "row",
    gap: 10,
  },
  quickAction: {
    flex: 1,
    minHeight: 104,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "space-between",
  },
  quickLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
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
    fontWeight: "900",
  },
  sectionAction: {
    color: colors.clayDark,
    fontSize: 13,
    fontWeight: "800",
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minHeight: 78,
    borderRadius: radius.sm,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "900",
  },
  metricLabel: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  cardStack: {
    gap: 10,
  },
  listCard: {
    minHeight: 72,
    borderRadius: radius.sm,
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
    fontWeight: "900",
  },
  listBody: {
    flex: 1,
    gap: 3,
  },
  listTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
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
    fontWeight: "900",
  },
  recorderState: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
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
    fontWeight: "800",
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
    fontWeight: "800",
  },
  pauseButton: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.clay,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    width: 86,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#FFF9F3",
    fontWeight: "900",
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
    fontWeight: "800",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "800",
  },
  archiveTargetValue: {
    marginTop: 3,
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "800",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
    marginBottom: 6,
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
    fontWeight: "900",
  },
  detailStats: {
    flexDirection: "row",
    gap: 8,
  },
  miniStat: {
    flex: 1,
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    padding: 10,
    justifyContent: "center",
  },
  miniStatValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  miniStatLabel: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  inlineActions: {
    flexDirection: "row",
    gap: 10,
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
    fontWeight: "900",
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
    fontWeight: "900",
  },
  sessionTime: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
  sessionGenerateText: {
    color: colors.clayDark,
    fontSize: 13,
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "800",
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
    fontWeight: "800",
  },
  editorTitle: {
    marginTop: 4,
    color: "#FFF9F3",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "800",
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
    fontWeight: "900",
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
    fontWeight: "900",
  },
  enabledWideText: {
    color: "#FFF9F3",
  },
  noticeToast: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 76,
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "800",
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
    fontWeight: "900",
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
    fontWeight: "900",
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
    fontWeight: "800",
  },
  metricSummaryValue: {
    marginTop: 8,
    color: "#FFF9F3",
    fontSize: 38,
    fontWeight: "900",
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
    fontWeight: "900",
  },
  segmentedScroll: {
    flexDirection: "row",
    gap: 6,
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
    fontWeight: "800",
  },
  dayButtonTextActive: {
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
    fontWeight: "900",
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
    fontWeight: "900",
  },
  accountName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
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
    fontWeight: "900",
  },
  dangerCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
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
  dangerButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "900",
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
    fontWeight: "800",
  },
  tabLabelActive: {
    color: colors.clayDark,
  },
});
