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
  Trash2,
  UserRound,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ScrollView,
} from "react-native";

import {
  formatBadge,
  metrics,
  privacyResources,
  profiles,
  recordings,
  reminders,
  reportSections,
  summaryChapters,
  transcriptTurns,
  type TabKey,
} from "./src/mockData";
import { colors, radius, shadow } from "./src/theme";

type QuickView =
  | "overview"
  | "recording"
  | "recordingRecords"
  | "archive"
  | "supervision"
  | "profileDetail"
  | "profileCreate"
  | "recordingDetail"
  | "reportEditor"
  | "privacyConsent";

const tabs: Array<{ key: TabKey; label: string; icon: typeof Home }> = [
  { key: "home", label: "首页", icon: Home },
  { key: "profiles", label: "档案", icon: FolderOpen },
  { key: "recordings", label: "资讯", icon: Newspaper },
  { key: "account", label: "我的", icon: UserRound },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const [quickView, setQuickView] = useState<QuickView>("overview");
  const { width } = useWindowDimensions();
  const isCompact = width < 430;

  const title = useMemo(() => {
    if (quickView === "recording") return "正在录音";
    if (quickView === "recordingRecords") return "录音记录";
    if (quickView === "archive") return "归档确认";
    if (quickView === "supervision") return "智能督导";
    if (quickView === "profileDetail") return "档案详情";
    if (quickView === "profileCreate") return "新增档案";
    if (quickView === "recordingDetail") return "录音纪要";
    if (quickView === "reportEditor") return "报告编辑";
    if (quickView === "privacyConsent") return "长期保存授权";
    if (tab === "profiles") return "档案库";
    if (tab === "recordings") return "资讯";
    if (tab === "account") return "我的";
    return "今天要做什么";
  }, [quickView, tab]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={[styles.phoneShell, isCompact && styles.phoneShellCompact]}>
        <Header title={title} quickView={quickView} onBack={() => setQuickView("overview")} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {tab === "home" && quickView === "overview" ? <HomeScreen onOpen={setQuickView} onOpenProfiles={() => setTab("profiles")} /> : null}
          {quickView === "recording" ? <RecordingScreen onArchive={() => setQuickView("archive")} /> : null}
          {quickView === "recordingRecords" ? <RecordingRecordsScreen onOpenDetail={() => setQuickView("recordingDetail")} /> : null}
          {quickView === "archive" ? <ArchiveScreen /> : null}
          {quickView === "supervision" ? <SupervisionScreen /> : null}
          {quickView === "profileDetail" ? <ProfileDetailScreen onOpenReport={() => setQuickView("reportEditor")} /> : null}
          {quickView === "profileCreate" ? <ProfileCreateScreen /> : null}
          {quickView === "recordingDetail" ? <RecordingDetailScreen onOpenReport={() => setQuickView("reportEditor")} /> : null}
          {quickView === "reportEditor" ? <ReportEditorScreen onOpenPrivacy={() => setQuickView("privacyConsent")} /> : null}
          {quickView === "privacyConsent" ? <PrivacyConsentScreen /> : null}
          {tab === "profiles" && quickView === "overview" ? <ProfilesScreen onOpenDetail={() => setQuickView("profileDetail")} onCreate={() => setQuickView("profileCreate")} /> : null}
          {tab === "recordings" && quickView === "overview" ? <ContentScreen /> : null}
          {tab === "account" && quickView === "overview" ? <AccountScreen onOpenPrivacy={() => setQuickView("privacyConsent")} /> : null}
        </ScrollView>
        {quickView !== "privacyConsent" ? (
          <BottomTabs
            active={tab}
            onChange={(next) => {
              setQuickView("overview");
              setTab(next);
            }}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function Header({ title, quickView, onBack }: { title: string; quickView: QuickView; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.kicker}>咨询师助手</Text>
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
      {quickView === "overview" ? (
        <TouchableOpacity style={styles.roundButton} activeOpacity={0.75}>
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

function HomeScreen({ onOpen, onOpenProfiles }: { onOpen: (view: QuickView) => void; onOpenProfiles: () => void }) {
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

      <SectionHeader title="本周统计" action="全部" />
      <View style={styles.metricRow}>
        {metrics.map((item) => (
          <View key={item.label} style={styles.metricCard}>
            <Text style={styles.metricValue}>{item.value}</Text>
            <Text style={styles.metricLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="近期任务" action="7 天" />
      <View style={styles.cardStack}>
        {reminders.map((item) => (
          <View key={item.title} style={styles.listCard}>
            <View style={styles.timePill}>
              <Text style={styles.timePillText}>{item.time}</Text>
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listMeta}>{item.kind} · {item.privacy}</Text>
            </View>
            <ChevronRight size={18} color={colors.subtle} />
          </View>
        ))}
      </View>
    </View>
  );
}

function RecordingScreen({ onArchive }: { onArchive: () => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.recorderPanel}>
        <View style={styles.recorderRing}>
          <View style={styles.recorderDot} />
          <Text style={styles.recorderTime}>00:42:18</Text>
          <Text style={styles.recorderState}>暂停中</Text>
        </View>
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.cancelButton} activeOpacity={0.75}>
            <Text style={styles.cancelButtonText}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pauseButton} activeOpacity={0.75}>
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
    </View>
  );
}

function RecordingRecordsScreen({ onOpenDetail }: { onOpenDetail: () => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        <FileText size={25} color={colors.clayDark} />
        <Text style={styles.posterTitle}>录音记录</Text>
        <Text style={styles.posterCopy}>集中查看待归档、生成中和可查看的录音，不和正在录音流程混在一起。</Text>
      </View>
      <SectionHeader title="录音列表" action="上传" />
      <View style={styles.cardStack}>
        {recordings.map((item) => (
          <TouchableOpacity key={item.title} style={styles.recordingCard} activeOpacity={0.78} onPress={onOpenDetail}>
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

function ArchiveScreen() {
  return (
    <View style={styles.stack}>
      <View style={styles.noticeCard}>
        <ShieldCheck size={24} color={colors.sageDark} />
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>陈雨 第6次咨询录音</Text>
          <Text style={styles.listMeta}>52:18 · AI 正在生成章节速览</Text>
        </View>
      </View>
      <StepRow index="1" title="身份类型" value="来访者档案" />
      <StepRow index="2" title="目标档案" value="陈雨 · 进行中" />
      <StepRow index="3" title="记录次数" value="第 6 次咨询" />
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>保存与隐私</Text>
        <Text style={styles.privacyCopy}>原始录音云端仅保存 14 天，不支持长期保存。转写和纪要可在生成后单独授权长期保存。</Text>
      </View>
      <PrimaryButton icon={FolderOpen} label="确认归档" onPress={() => undefined} wide />
    </View>
  );
}

function ProfilesScreen({ onOpenDetail, onCreate }: { onOpenDetail: () => void; onCreate: () => void }) {
  return (
    <View style={styles.stack}>
      <TouchableOpacity style={styles.createProfileButton} activeOpacity={0.78} onPress={onCreate}>
        <Plus size={19} color="#FFF9F3" />
        <Text style={styles.createProfileButtonText}>新增档案</Text>
      </TouchableOpacity>
      <View style={styles.searchBar}>
        <Search size={18} color={colors.subtle} />
        <Text style={styles.searchPlaceholder}>搜索姓名、编号、状态</Text>
      </View>
      <View style={styles.segmented}>
        <Text style={[styles.segmentText, styles.segmentActive]}>来访者</Text>
        <Text style={styles.segmentText}>督导师</Text>
        <Text style={styles.segmentText}>受督者</Text>
      </View>
      <View style={styles.cardStack}>
        {profiles.map((item) => (
          <TouchableOpacity key={item.name} style={styles.profileCard} activeOpacity={0.78} onPress={onOpenDetail}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.name} · {item.count}</Text>
              <Text style={styles.listMeta}>{item.type} · 下次 {item.next}</Text>
              <View style={styles.badgeRow}>
                <Badge label={item.status} tone="green" />
                <Badge label={`风险 ${item.risk}`} tone={item.risk === "轻度" ? "warm" : "blue"} />
              </View>
            </View>
            <LockKeyhole size={18} color={colors.subtle} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ProfileCreateScreen() {
  const [kind, setKind] = useState<"client" | "supervisor" | "supervisee">("client");
  const fields = {
    client: ["姓名 / 昵称", "联系方式", "主诉与来访目标", "紧急联系人", "知情同意书"],
    supervisor: ["姓名 / 称呼", "督导方向", "机构 / 资质", "督导协议", "下次受督时间"],
    supervisee: ["姓名 / 称呼", "受督方向", "当前阶段", "督导评价", "下次督导时间"],
  }[kind];

  return (
    <View style={styles.stack}>
      <View style={styles.identityPicker}>
        <IdentityOption active={kind === "client"} title="新增来访者" detail="咨询记录与个案报告" onPress={() => setKind("client")} />
        <IdentityOption active={kind === "supervisor"} title="新增督导师" detail="受督记录与反馈" onPress={() => setKind("supervisor")} />
        <IdentityOption active={kind === "supervisee"} title="新增受督者" detail="督导记录与评价" onPress={() => setKind("supervisee")} />
      </View>
      <View style={styles.formPreviewCard}>
        <Text style={styles.formPreviewTitle}>需要填写</Text>
        {fields.map((field) => (
          <View key={field} style={styles.formFieldRow}>
            <Text style={styles.formFieldLabel}>{field}</Text>
            <Text style={styles.formFieldValue}>待填写</Text>
          </View>
        ))}
      </View>
      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>基础档案长期保存</Text>
        <Text style={styles.privacyCopy}>基础档案信息会长期保存在云端；录音、报告、附件等敏感资料仍按 14 天临时保存与主动授权规则处理。</Text>
      </View>
      <PrimaryButton icon={FolderOpen} label="创建档案" onPress={() => undefined} wide />
    </View>
  );
}

function ProfileDetailScreen({ onOpenReport }: { onOpenReport: () => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.profileHeaderCard}>
        <View style={styles.detailHeroTop}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>陈</Text>
          </View>
          <View style={styles.listBody}>
            <Text style={styles.detailName}>陈雨</Text>
            <Text style={styles.listMeta}>ID: 20260605-A08 · 来访者档案</Text>
          </View>
          <Badge label="已解锁" tone="green" />
        </View>
        <View style={styles.detailStats}>
          <MiniStat label="状态" value="进行中" />
          <MiniStat label="频率" value="每周" />
          <MiniStat label="下次" value="6月8日" />
        </View>
      </View>

      <SectionHeader title="法律及伦理文件" action="上传" />
      <View style={styles.legalGrid}>
        <LegalFile title="知情同意书" meta="已签署 · 第 2 版" icon={FileText} />
        <LegalFile title="咨询协议" meta="已签署 · 6月3日" icon={ClipboardList} />
      </View>

      <SectionHeader title="咨询历程" action="新增记录" />
      <SessionCard
        index="第 6 次"
        time="2026年6月5日 10:00"
        summary="围绕睡眠下降、工作评价焦虑和关系议题展开。"
        tags={["焦虑", "睡眠"]}
        recording="剩余 13 天"
        record="草稿"
        scale="未上传"
        homework="已布置"
        other="1 项"
        onOpenReport={onOpenReport}
      />
      <SessionCard
        index="第 5 次"
        time="2026年5月29日 10:00"
        summary="梳理近期压力事件，并继续识别自动化想法。"
        tags={["长期保存", "正式版"]}
        recording="已销毁"
        record="正式版"
        scale="SAS"
        homework="已提交"
        other="无"
        onOpenReport={onOpenReport}
      />

      <View style={styles.privacyPanel}>
        <Text style={styles.privacyTitle}>保存规则会跟随每次记录</Text>
        <Text style={styles.privacyCopy}>录音只能临时保存 14 天；记录、量表、作业和其他附件可在对应卡片内主动授权长期保存。草稿保存为正式版后，正式版不可直接编辑。</Text>
      </View>

      <PrimaryButton icon={Sparkles} label="生成个案报告" onPress={onOpenReport} wide />
    </View>
  );
}

function RecordingDetailScreen({ onOpenReport }: { onOpenReport: () => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.noticeCard}>
        <CheckCircle2 size={23} color={colors.sageDark} />
        <View style={styles.listBody}>
          <Text style={styles.listTitle}>陈雨 第6次咨询录音</Text>
          <Text style={styles.listMeta}>52:18 · 已归档 · 原始录音 13 天后销毁</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>录音纪要</Text>
          <Badge label="可重新生成" tone="blue" />
        </View>
        <Text style={styles.summaryCopy}>本次来访者主要围绕睡眠下降、工作评价焦虑和关系议题展开。咨询师进行了事实、推测与情绪反应的区分。</Text>
        <View style={styles.inlineActions}>
          <GhostButton icon={RefreshCcw} label="重新生成" onPress={() => undefined} />
          <PrimaryButton icon={Edit3} label="编辑报告" onPress={onOpenReport} />
        </View>
      </View>

      <SectionHeader title="章节速览" action="编辑" />
      <View style={styles.cardStack}>
        {summaryChapters.map((item) => (
          <ChapterRow key={item.time} time={item.time} title={item.title} current={item.current} />
        ))}
      </View>

      <SectionHeader title="转写片段" action="完整文本" />
      <View style={styles.transcriptTools}>
        <View style={styles.transcriptToolHeader}>
          <Text style={styles.transcriptToolTitle}>转写校对</Text>
          <Badge label="3 处待确认" tone="warm" />
        </View>
        <View style={styles.speakerRow}>
          <Text style={styles.speakerChip}>来访者：陈雨</Text>
          <Text style={styles.speakerChip}>咨询师：林咨询师</Text>
        </View>
        <Text style={styles.transcriptToolCopy}>可编辑发言人名称、逐段校对文本。修改后会同步影响纪要和后续报告草稿。</Text>
      </View>
      <View style={styles.transcriptCard}>
        {transcriptTurns.map((item) => (
          <View key={item.time} style={styles.transcriptTurn}>
            <Text style={styles.transcriptSpeaker}>{item.speaker} · {item.time}</Text>
            <Text style={styles.transcriptText}>{item.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.exportPanel}>
        <DataRow icon={Download} title="导出 PDF / Word" value="纪要与转写均可导出" />
        <DataRow icon={ShieldCheck} title="长期保存授权" value="转写与纪要可授权，原始录音不可授权" />
      </View>
    </View>
  );
}

function ReportEditorScreen({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.editorEyebrow}>咨询记录草稿</Text>
          <Text style={styles.editorTitle}>陈雨 · 第 6 次咨询</Text>
        </View>
        <Badge label="草稿" tone="warm" />
      </View>
      <View style={styles.ruleCard}>
        <CircleAlert size={19} color={colors.clayDark} />
        <Text style={styles.ruleText}>正式版不能直接编辑。保存正式版前，请确认草稿内容；后续修改会先复制为草稿再替换正式版。</Text>
      </View>

      <View style={styles.editorToolbar}>
        <GhostButton icon={History} label="草稿" onPress={() => undefined} />
        <GhostButton icon={FileText} label="正式版" onPress={() => undefined} />
      </View>

      <View style={styles.editorStatusGrid}>
        <MiniStat label="编辑段落" value="3 段" />
        <MiniStat label="模板" value="内置" />
        <MiniStat label="状态" value="未保存" />
      </View>

      {reportSections.map((section) => (
        <View key={section.title} style={styles.editSection}>
          <View style={styles.editSectionHeader}>
            <Text style={styles.editSectionTitle}>{section.title}</Text>
            <Edit3 size={16} color={colors.subtle} />
          </View>
          <Text style={styles.editSectionText}>{section.content}</Text>
        </View>
      ))}

      <View style={styles.savePanel}>
        <PrimaryButton icon={Save} label="保存为正式版" onPress={() => undefined} wide />
        <GhostButton icon={ShieldCheck} label="授权长期保存草稿与正式版" onPress={onOpenPrivacy} />
      </View>
    </View>
  );
}

function PrivacyConsentScreen() {
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
          <ConsentItem title="陈雨 第6次咨询转写" meta="转写文本 · 可授权" selected={selected.includes("陈雨 第6次咨询转写")} onPress={() => toggleConsent("陈雨 第6次咨询转写")} />
          <ConsentItem title="陈雨 第6次录音纪要" meta="录音纪要 · 可授权" selected={selected.includes("陈雨 第6次录音纪要")} onPress={() => toggleConsent("陈雨 第6次录音纪要")} />
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
          <TouchableOpacity style={styles.secondaryWideButton} activeOpacity={0.78}>
            <Text style={styles.secondaryWideText}>暂不授权</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.disabledWideButton, hasSelected && styles.enabledWideButton]} activeOpacity={0.78} disabled={!hasSelected}>
            <Text style={[styles.disabledWideText, hasSelected && styles.enabledWideText]}>{hasSelected ? `确认授权 ${selected.length} 项` : "需手动勾选"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function SupervisionScreen() {
  return (
    <View style={styles.stack}>
      <View style={styles.aiPanel}>
        <Sparkles size={24} color={colors.clayDark} />
        <Text style={styles.aiTitle}>本次会话未添加资料</Text>
        <Text style={styles.aiCopy}>AI 不会读取任何档案内容。添加资料后，回答会显示引用来源。</Text>
        <GhostButton icon={Plus} label="添加资料" onPress={() => undefined} />
      </View>
      <ChatBubble align="left" text="可以帮我整理一个适合带去督导的问题清单吗？" />
      <ChatBubble align="right" text="可以。请先选择要参考的档案、报告或附件；未添加资料时，我只能提供通用整理框架。" />
      <View style={styles.composer}>
        <Text style={styles.composerText}>输入想讨论的主题</Text>
        <TouchableOpacity style={styles.sendButton} activeOpacity={0.75}>
          <Play size={17} color="#FFF9F3" fill="#FFF9F3" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ContentScreen() {
  return (
    <View style={styles.stack}>
      <View style={styles.poster}>
        <BookOpenText size={25} color={colors.clayDark} />
        <Text style={styles.posterTitle}>专业资讯</Text>
        <Text style={styles.posterCopy}>记录书写、隐私伦理、督导准备和风险识别的轻量参考。</Text>
      </View>
      <SectionHeader title="书写参考" action="更多" />
      <ArticleRow title="如何准备一次有效督导" tag="督导" />
      <ArticleRow title="咨询资料保存的边界" tag="隐私" />
      <ArticleRow title="危机风险记录的提醒" tag="安全" />
    </View>
  );
}

function AccountScreen({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  return (
    <View style={styles.stack}>
      <View style={styles.accountCard}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>林</Text>
        </View>
        <View style={styles.listBody}>
          <Text style={styles.accountName}>林咨询师</Text>
          <Text style={styles.listMeta}>心理咨询师 · 个人版</Text>
        </View>
        <Settings size={20} color={colors.subtle} />
      </View>
      <SectionHeader title="数据与隐私" action="查看" />
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
      <SectionHeader title="安全" action="设置" />
      <View style={styles.settingsList}>
        <SettingsRow icon={LockKeyhole} title="档案访问密码" value="三类档案独立设置" />
        <SettingsRow icon={CalendarDays} title="手机日历同步" value="隐私标题模式关闭" />
        <SettingsRow icon={ShieldCheck} title="账号安全" value="邮箱登录" />
      </View>
    </View>
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

function SectionHeader({ title, action }: { title: string; action: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionAction}>{action}</Text>
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

function Badge({ label, tone }: { label: string; tone: "warm" | "green" | "blue" }) {
  return <Text style={[styles.badge, styles[`badge_${tone}`]]}>{label}</Text>;
}

function StepRow({ index, title, value }: { index: string; title: string; value: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIndex}>
        <Text style={styles.stepIndexText}>{index}</Text>
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listMeta}>{title}</Text>
        <Text style={styles.listTitle}>{value}</Text>
      </View>
      <ChevronRight size={18} color={colors.subtle} />
    </View>
  );
}

function ChatBubble({ align, text }: { align: "left" | "right"; text: string }) {
  return (
    <View style={[styles.chatBubble, align === "right" && styles.chatBubbleRight]}>
      <Text style={[styles.chatText, align === "right" && styles.chatTextRight]}>{text}</Text>
    </View>
  );
}

function ArticleRow({ title, tag }: { title: string; tag: string }) {
  return (
    <View style={styles.articleRow}>
      <Badge label={tag} tone="blue" />
      <Text style={styles.articleTitle}>{title}</Text>
      <ChevronRight size={18} color={colors.subtle} />
    </View>
  );
}

function SettingsRow({ icon: Icon, title, value }: { icon: typeof LockKeyhole; title: string; value: string }) {
  return (
    <View style={styles.settingsRow}>
      <Icon size={19} color={colors.clayDark} />
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{value}</Text>
      </View>
    </View>
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

function LegalFile({ title, meta, icon: Icon }: { title: string; meta: string; icon: typeof FileText }) {
  return (
    <View style={styles.legalFile}>
      <View style={styles.legalIcon}>
        <Icon size={19} color={colors.clayDark} />
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{meta}</Text>
      </View>
    </View>
  );
}

function SessionCard({
  index,
  time,
  summary,
  tags,
  recording,
  record,
  scale,
  homework,
  other,
  onOpenReport,
}: {
  index: string;
  time: string;
  summary: string;
  tags: string[];
  recording: string;
  record: string;
  scale: string;
  homework: string;
  other: string;
  onOpenReport: () => void;
}) {
  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionTop}>
        <View style={styles.listBody}>
          <View style={styles.sessionTitleRow}>
            <Text style={styles.sessionIndex}>{index}</Text>
            <Text style={styles.sessionTime}>{time}</Text>
          </View>
          <Text style={styles.sessionSummary}>{summary}</Text>
        </View>
        <View style={styles.sessionTags}>
          {tags.map((tag) => (
            <Text key={tag} style={styles.sessionTag}>{tag}</Text>
          ))}
        </View>
      </View>

      <View style={styles.sessionActionGrid}>
        <SessionAction icon={Mic} label="录音" status={recording} tone={recording.includes("剩余") ? "warm" : "muted"} />
        <SessionAction icon={Edit3} label="记录" status={record} tone={record === "草稿" ? "blue" : "green"} />
        <SessionAction icon={ChartNoAxesColumn} label="量表" status={scale} tone={scale === "未上传" ? "muted" : "green"} />
        <SessionAction icon={ClipboardList} label="作业" status={homework} tone={homework.includes("已") ? "green" : "muted"} />
        <SessionAction icon={Plus} label="其他" status={other} tone={other === "无" ? "muted" : "blue"} />
      </View>

      <View style={styles.sessionFooter}>
        <Text style={styles.sessionRule}>记录可存草稿/正式版；敏感资料需主动授权长期保存</Text>
        <TouchableOpacity style={styles.sessionGenerateButton} activeOpacity={0.78} onPress={onOpenReport}>
          <Sparkles size={16} color={colors.clayDark} />
          <Text style={styles.sessionGenerateText}>生成咨询记录</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SessionAction({ icon: Icon, label, status, tone }: { icon: typeof Mic; label: string; status: string; tone: "warm" | "green" | "blue" | "muted" }) {
  return (
    <TouchableOpacity style={styles.sessionAction} activeOpacity={0.78}>
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

function DataRow({ icon: Icon, title, value }: { icon: typeof FileText; title: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Icon size={18} color={colors.clayDark} />
      <View style={styles.listBody}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{value}</Text>
      </View>
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
  stepRow: {
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
  stepIndex: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.clay,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndexText: {
    color: "#FFF9F3",
    fontWeight: "900",
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
  segmented: {
    height: 44,
    borderRadius: radius.sm,
    padding: 4,
    backgroundColor: colors.surfaceSoft,
    flexDirection: "row",
  },
  segmentText: {
    flex: 1,
    borderRadius: radius.sm,
    textAlign: "center",
    textAlignVertical: "center",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 34,
    fontWeight: "800",
  },
  segmentActive: {
    color: colors.clayDark,
    backgroundColor: colors.surface,
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
  formFieldRow: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  formFieldLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  formFieldValue: {
    color: colors.subtle,
    fontSize: 12,
    fontWeight: "700",
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
  editSectionText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
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
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.clay,
    alignItems: "center",
    justifyContent: "center",
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
