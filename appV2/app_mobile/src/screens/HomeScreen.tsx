import { paper } from '../creatorSpace/ui';
import { CreatorSpace } from '../creatorSpace/CreatorSpace';
import { useMailNotificationStore } from '../services/mailNotifications';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Sidebar } from '../components/Sidebar';
import type { ContentFilter } from '../components/Sidebar';
import { selectionHaptic } from '../services/haptics';
import type { RootStackParamList } from '../navigation/types';
import { useNotesStore } from '../notes/useNotesStore';
import { ringConnectionService } from '../ring/RingConnectionService';
import { useRingStore } from '../ring/store/useRingStore';
import { useRecordingStore } from '../ring/store/useRecordingStore';
import { colors } from '../theme/tokens';
import { recordingTitle, isAudioFilename } from '../ring/recordingTitle';
import { confirmDeleteEntry } from '../services/confirmDeleteEntry';
import { sameRecording } from '../ring/recordingIdentity';
import { AgentDashboard } from '../components/AgentDashboard';
import { RecordingPipelineNotice } from '../components/RecordingPipelineNotice';
import {
  CompactRecordingList,
  type RecordingEntry,
} from '../components/CompactRecordingList';

export const connectionLabels = {
  idle: '未连接',
  disconnected: '已断开',
  scanning: '搜索中',
  connecting: '连接中',
  authenticating: '鉴权中',
  connected: '已连接',
  recording: '录音中',
  syncing: '同步中',
  failed: '连接异常',
};
type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
export function HomeScreen({ navigation, route }: Props) {
  const mailUnread = useMailNotificationStore(state => state.unreadCount);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ContentFilter>('all');
  useEffect(() => {
    if (route?.params?.workspace) setFilter('all');
  }, [route?.params]);
  const status = useRingStore(state => state.status);
  const syncProgress = useRingStore(state => state.syncProgress);
  const syncError = useRingStore(state => state.syncError);
  const notes = useNotesStore(state => state.notes);
  const files = useRecordingStore(state => state.files);
  useEffect(() => {
    ringConnectionService
      .reconnectLast()
      .catch(error => useRingStore.getState().setError(error.message));
  }, []);
  const cards = useMemo(
    () =>
      [
        ...notes
          .filter(
            (note, index) =>
              !note.recordingUri ||
              !notes
                .slice(0, index)
                .some(item =>
                  sameRecording(item.recordingUri, note.recordingUri),
                ),
          )
          .map(note => {
            const file = files.find(item =>
              sameRecording(item.uri, note.recordingUri),
            );
            return {
              id: note.id,
              title:
                file && (isAudioFilename(note.title) || !note.title)
                  ? recordingTitle(file)
                  : note.title,
              text: note.text.trim() || file?.transcript || '',
              time: note.createdAt,
              uri: note.recordingUri,
              file,
            };
          }),
        ...files
          .filter(
            file =>
              !notes.some(note => sameRecording(note.recordingUri, file.uri)),
          )
          .map(file => ({
            id: file.uri,
            title: recordingTitle(file),
            text:
              file.transcript ||
              `${
                file.source === 'phone' ? '手机录音已保存' : '戒指录音已同步'
              } · 本机识别`,
            time: file.timestamp,
            uri: file.uri,
            file,
          })),
      ].sort((a, b) => b.time - a.time),
    [files, notes],
  );
  const counts = {
    all: cards.length,
    notes: cards.filter(card => !card.uri).length,
    recordings: cards.filter(card => !!card.uri).length,
  };
  const visibleCards = useMemo(
    () =>
      cards
        .filter(card => !!card.uri)
        .map(card => ({
          ...card,
          time: card.file?.timestamp ?? card.time,
        })),
    [cards],
  );
  const openRecording = useCallback(
    (card: RecordingEntry) => {
      navigation.navigate('Note', { recordingUri: card.uri });
    },
    [navigation],
  );
  const manageRecording = useCallback((card: RecordingEntry) => {
    selectionHaptic();
    confirmDeleteEntry({ file: card.file, noteId: card.id, title: card.title });
  }, []);
  const changeFilter = (next: ContentFilter) => {
    setFilter(next);
    setSearchOpen(false);
    setSearch('');
  };
  const online = ['connected', 'recording', 'syncing'].includes(status);
  const sidebar = (
    <Sidebar
      visible={sidebarOpen}
      onClose={() => setSidebarOpen(false)}
      filter={filter}
      counts={counts}
      onFilter={changeFilter}
      onNavigate={destination => navigation.navigate(destination)}
      deviceLabel={connectionLabels[status]}
      online={online}
    />
  );
  if (filter === 'notes') {
    return (
      <>
        <SafeAreaView
          style={[styles.root, { backgroundColor: paper }]}
          edges={['top', 'bottom']}
        >
          <CreatorSpace
            menu={() => setSidebarOpen(true)}
            device={() => navigation.navigate('Device')}
            deviceLabel={connectionLabels[status]}
            open={(detail, parent) =>
              navigation.navigate('CreatorDetail', { detail, parent })
            }
          />
        </SafeAreaView>
        {sidebar}
      </>
    );
  }
  return (
    <LinearGradient
      colors={
        filter === 'all'
          ? ['#FFFFFF', '#FFFFFF', '#FFFFFF']
          : ['#FBFBF9', '#FBFBF9', '#FBFBF9']
      }
      locations={[0, 0.55, 1]}
      style={styles.root}
    >
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {filter === 'all' ? (
          <View style={styles.todayToolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open sidebar"
              onPress={() => setSidebarOpen(true)}
            >
              <Text style={styles.todayBrand}>
                spur<Text style={styles.brandDot}>.</Text>
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`邮件通知，${mailUnread}封未读`}
              onPress={() => navigation.navigate('AgentMailbox')}
              style={styles.bell}
            >
              <Icon name="bell" size={23} />
              {mailUnread > 0 && (
                <Text style={styles.mailBadge}>
                  {mailUnread > 99 ? '99+' : mailUnread}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.recordingsToolbar}>
            <Pressable
              accessibilityLabel="打开侧边栏"
              accessibilityRole="button"
              style={styles.toolbarButton}
              onPress={() => setSidebarOpen(true)}
            >
              <Icon name="menu" size={20} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.recordingsTitle}>
              录音记录
            </Text>
            <Pressable
              accessibilityLabel={searchOpen ? '关闭搜索' : '搜索录音'}
              accessibilityRole="button"
              style={styles.toolbarButton}
              onPress={() => {
                if (searchOpen) setSearch('');
                setSearchOpen(!searchOpen);
              }}
            >
              <Icon name={searchOpen ? 'close' : 'search'} size={20} />
            </Pressable>
          </View>
        )}
        {status === 'syncing' && (
          <View style={styles.syncHint} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color="#7A896C" />
            <Text style={styles.syncText}>
              正在同步戒指录音 · {syncProgress}%
            </Text>
          </View>
        )}
        {!!syncError && status !== 'syncing' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              status === 'connected' ? '重试戒指录音同步' : '查看戒指同步问题'
            }
            style={styles.syncHint}
            onPress={() => {
              if (status !== 'connected') {
                navigation.navigate('Device');
                return;
              }
              ringConnectionService
                .syncRecordings()
                .catch(error => Alert.alert('同步未完成', error.message));
            }}
          >
            <Text style={styles.syncError}>
              {syncError} · {status === 'connected' ? '点击重试' : '查看设备'} ↗
            </Text>
          </Pressable>
        )}
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {filter === 'all' ? (
            <AgentDashboard
              entries={cards}
              onUseFramework={initialText =>
                navigation.navigate('Chat', { initialText, autoSend: false })
              }
              onOpen={card =>
                navigation.navigate(
                  'Note',
                  card.uri ? { recordingUri: card.uri } : { id: card.id },
                )
              }
              onDelete={card => {
                selectionHaptic();
                confirmDeleteEntry({
                  file: card.file,
                  noteId: card.id,
                  title: card.title,
                });
              }}
              onRecord={() => navigation.navigate('Recorder')}
              onDevice={() => navigation.navigate('Device')}
              onSettings={() => navigation.navigate('Settings')}
              onOpenMailbox={messageId =>
                navigation.navigate('AgentMailbox', { messageId })
              }
            />
          ) : (
            <>
              {searchOpen && (
                <TextInput
                  accessibilityLabel="搜索录音"
                  placeholder="搜索标题或转写"
                  style={styles.recordingSearch}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
              )}
              <CompactRecordingList
                entries={visibleCards}
                query={search}
                onOpen={openRecording}
                onManage={manageRecording}
                header={
                  <RecordingPipelineNotice
                    compact
                    onSettings={() => navigation.navigate('Settings')}
                  />
                }
                empty={
                  <View style={styles.empty}>
                    <View style={styles.emptyIcon}>
                      <Icon name="note" size={42} color="#90998A" />
                    </View>
                    <Text style={styles.emptyTitle}>收藏每一个有声瞬间</Text>
                    <Text style={styles.emptyText}>
                      连接戒指同步录音，或用手机开始录制。录音和转写内容都会在这里汇集。
                    </Text>
                    <Pressable
                      style={styles.connectLink}
                      onPress={() => navigation.navigate('Device')}
                    >
                      <Text style={styles.linkText}>连接我的录音戒指 ↗</Text>
                    </Pressable>
                  </View>
                }
              />
              <View style={styles.composer}>
                <Pressable
                  accessibilityLabel="新建笔记"
                  style={styles.circle}
                  onPress={() => navigation.navigate('Note')}
                >
                  <Icon name="plus" />
                </Pressable>
                <Pressable
                  style={styles.prompt}
                  onPress={() => navigation.navigate('Chat')}
                >
                  <Text style={styles.placeholder}>你说，我做</Text>
                  <Text style={styles.spark}>✦</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="手机录音"
                  style={styles.circle}
                  onPress={() => navigation.navigate('Recorder')}
                >
                  <Icon name="mic" color="#FD613F" />
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      {sidebar}
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  mailBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    fontSize: 10,
    color: '#fff',
    backgroundColor: '#71845C',
    borderRadius: 9,
    minWidth: 16,
    textAlign: 'center',
  },
  todayToolbar: {
    height: 53,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayBrand: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: -1.6,
  },
  brandDot: { color: '#2563EB' },
  bell: { padding: 8 },
  todayScroll: { paddingHorizontal: 20, paddingTop: 0 },
  todayComposer: {
    marginHorizontal: 16,
    marginTop: 7,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E8ED',
    padding: 5,
    shadowColor: '#182235',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  inputAction: { padding: 9 },
  agentInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: '#111827',
    paddingVertical: 10,
  },
  syncHint: {
    marginHorizontal: 24,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#EDF1E7',
  },
  syncText: { fontSize: 12, color: '#7A896C' },
  syncError: { fontSize: 12, color: '#A46F53' },
  root: { flex: 1 },
  recordingsToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  toolbarButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingsTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#222622',
  },
  recordingSearch: {
    marginHorizontal: 18,
    minHeight: 40,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D8CD',
    color: '#222622',
  },
  circle: {
    width: 49,
    height: 49,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#D7D6D1',
    backgroundColor: '#FFFFFF99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyIcon: { padding: 28, borderRadius: 48, backgroundColor: '#ECEDE7' },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#474D41',
    marginTop: 25,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 24,
    color: '#999D93',
    textAlign: 'center',
    marginTop: 12,
  },
  connectLink: { marginTop: 26, padding: 12 },
  linkText: { fontSize: 14, color: '#606D51' },
  composer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: 'center',
  },
  prompt: {
    height: 50,
    borderRadius: 28,
    borderColor: '#D7D6D1',
    borderWidth: 1,
    backgroundColor: '#FFFFFFAA',
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  placeholder: { color: '#969F8A', fontSize: 13, flexShrink: 1 },
  spark: { color: '#8A9780', fontSize: 22 },
});
