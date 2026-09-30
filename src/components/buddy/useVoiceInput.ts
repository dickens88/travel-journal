import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { describeError } from '@/ai/client';
import { stopSpeaking } from '@/ai/speech';
import { CLAUDE_CANT_HEAR, transcribe } from '@/ai/transcribe';
import { toast } from '@/components/common/Toast';
import { aiConfigured, loadSettings } from '@/settings/settings';
import { speechLevel, toWav } from '@/utils/wav';

// Speech recognition works best on 16 kHz mono
const SAMPLE_RATE = 16000;
const MAX_SECONDS = 60;
// Loudest 50 ms stretch below about -40 dBFS counts as silence
const SILENCE_LEVEL = 0.01;

export type VoiceState = 'idle' | 'recording' | 'transcribing';

// Tap to record, tap again to turn the speech into text; the text is handed back for the user to edit before sending.
// Models that can't hear (Claude) hand over to the keyboard instead, whose own mic key does the dictation.
export function useVoiceInput(onText: (text: string) => void, onUseKeyboard: () => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const chunks = useRef<ArrayBuffer[]>([]);
  const format = useRef({ sampleRate: SAMPLE_RATE, channels: 1 });
  const { stream } = useAudioStream({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (b) => {
      // Copy: the native side may reuse its buffer
      chunks.current.push(b.data.slice(0));
      format.current = { sampleRate: b.sampleRate, channels: b.channels };
    },
  });

  const release = () => {
    stream.stop();
    // Let replies be read aloud through the speaker again
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  };

  const start = async () => {
    if (state !== 'idle') return;
    const settings = await loadSettings();
    if (settings.provider === 'anthropic') {
      onUseKeyboard();
      toast(CLAUDE_CANT_HEAR);
      return;
    }
    if (!aiConfigured(settings)) {
      Alert.alert('还没有设置 AI', '语音转文字由设置里的模型完成，先填好火山方舟的 API Key 和模型', [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => router.push('/settings') },
      ]);
      return;
    }
    const perm = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
    if (!perm.granted) {
      Alert.alert('没有麦克风权限', '在系统设置里允许旅迹使用麦克风后再试');
      return;
    }
    stopSpeaking();
    chunks.current = [];
    setSeconds(0);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await stream.start();
      setState('recording');
    } catch (e) {
      release();
      Alert.alert('没能开始录音', describeError(e));
    }
  };

  const cancel = () => {
    if (state !== 'recording') return;
    release();
    chunks.current = [];
    setState('idle');
  };

  const finish = async () => {
    if (state !== 'recording') return;
    release();
    const audio = chunks.current;
    chunks.current = [];
    if (!audio.length) {
      setState('idle');
      return;
    }
    // Nothing above background noise: don't send it, chat models tend to invent words for silence
    if (speechLevel(audio, format.current.sampleRate) < SILENCE_LEVEL) {
      setState('idle');
      toast('没听到说话声，再试一次', false);
      return;
    }
    setState('transcribing');
    const wav = toWav(audio, format.current.sampleRate, format.current.channels);
    // The WAV holds its own copy; don't keep the chunks alive through the upload
    audio.length = 0;
    try {
      onText(await transcribe(wav));
    } catch (e) {
      toast(describeError(e), false);
    } finally {
      setState('idle');
    }
  };

  // Elapsed time, with a hard stop so a forgotten recording doesn't grow without bound
  useEffect(() => {
    if (state !== 'recording') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);
  const timeUp = useEffectEvent(() => finish());
  useEffect(() => {
    if (state === 'recording' && seconds >= MAX_SECONDS) timeUp();
  }, [state, seconds]);

  return { state, seconds, start, cancel, finish };
}
