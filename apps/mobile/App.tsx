import { StatusBar } from "expo-status-bar";
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  FolderOpen,
  Home,
  LockKeyhole,
  Mic,
  Newspaper,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { formatBadge, metrics, privacyResources, profiles, recordings, reminders, type TabKey } from "./src/mockData";
import { colors, radius, shadow } from "./src/theme";

type QuickView = "overview" | "recording" | "archive" | "supervision";

const tabs: Array<{ key: TabKey; label: string; icon: typeof Home }> = [
  { key: "home", label: "首页", icon: Home },
  { key: "profiles", label: "文档", icon: FolderOpen },
  { key: "recordings", label: "资讯", icon: Newspaper },
  { key: "account", label: "我的", icon: UserRound },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const [quickView, setQuickView] = useState<QuickView>("overview");
  const { width } = useWindowDimensions();
  const isCompact = width < 430;

  const title = useMemo(() => {
    if (quickView === "recording") return "录音记录";
    if (quickView === "archive") return "归档确认";
    if (quickView === "supervision") return "智能督导";
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
          {tab === "home" && quickView === "overview" ? <HomeScreen onOpen={setQuickView} /> : null}
          {quickView === "recording" ? <RecordingScreen onArchive={() => setQuickView("archive")} /> : null}
          {quickView === "archive" ? <ArchiveScreen /> : null}
          {quickView === "supervision" ? <SupervisionScreen /> : null}
          {tab === "profiles" && quickView === "overview" ? <ProfilesScreen /> : null}
          {tab === "recordings" && quickView === "overview" ? <ContentScreen /> : null}
          {tab === "account" && quickView === "overview" ? <AccountScreen /> : null}
        </ScrollView>
        <BottomTabs
          active={tab}
          onChange={(next) => {
            setQuickView("overview");
            setTab(next);
          }}
        />
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

function HomeScreen({ onOpen }: { onOpen: (view: QuickView) => void }) {
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
          <GhostButton icon={Sparkles} label="智能督导" onPress={() => onOpen("supervision")} />
        </View>
      </View>

      <View style={styles.quickGrid}>
        <QuickAction icon={Mic} label="录音记录" detail="3 条待处理" onPress={() => onOpen("recording")} />
        <QuickAction icon={FolderOpen} label="档案库" detail="24 个档案" onPress={() => undefined} />
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

      <SectionHeader title="录音列表" action="上传" />
      <View style={styles.cardStack}>
        {recordings.map((item) => (
          <View key={item.title} style={styles.recordingCard}>
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
          </View>
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

function ProfilesScreen() {
  return (
    <View style={styles.stack}>
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
          <View key={item.name} style={styles.profileCard}>
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
          </View>
        ))}
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
        <Text style={styles.posterTitle}>咨询记录书写专题</Text>
        <Text style={styles.posterCopy}>从录音纪要到正式记录，保持结构清晰和伦理边界。</Text>
      </View>
      <ArticleRow title="如何准备一次有效督导" tag="督导" />
      <ArticleRow title="咨询资料保存的边界" tag="隐私" />
      <ArticleRow title="危机风险记录的提醒" tag="安全" />
    </View>
  );
}

function AccountScreen() {
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
          <View key={item.title} style={styles.privacyResource}>
            <Clock3 size={18} color={item.preservable ? colors.sageDark : colors.danger} />
            <View style={styles.listBody}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listMeta}>{item.type} · {item.expires}</Text>
            </View>
            <Badge label={item.preservable ? "可授权" : "不可长期"} tone={item.preservable ? "green" : "warm"} />
          </View>
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
    paddingBottom: 110,
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
