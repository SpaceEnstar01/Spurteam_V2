import { ringConnectionService } from '../src/ring/RingConnectionService';
import { useRingStore } from '../src/ring/store/useRingStore';
import { vendorEvents, vendorModule } from '../src/ring/native';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useRecordingStore } from '../src/ring/store/useRecordingStore';

jest.mock('../src/ring/native', () => {
  const handlers = new Map();
  const module = {
    initSdk: jest.fn().mockResolvedValue(true),
    startScan: jest.fn().mockResolvedValue(true),
    stopScan: jest.fn(),
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    syncVoiceRecordings: jest.fn().mockResolvedValue({ files: [] }),
  };
  return {
    vendorModule: () => module,
    vendorEvents: () => ({
      addListener: (name: string, handler: (event: unknown) => void) => {
        handlers.set(name, handler);
        return { remove: () => handlers.delete(name) };
      },
      emit: (name: string, event: unknown) => handlers.get(name)?.(event),
    }),
  };
});

function emit(name: string, event: unknown) {
  (
    vendorEvents() as unknown as {
      emit: (name: string, event: unknown) => void;
    }
  ).emit(name, event);
}
let changeAppState: (state: AppStateStatus) => void;
beforeAll(async () => {
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, handler) => {
      changeAppState = handler;
      return { remove: jest.fn() };
    });
  await ringConnectionService.initialize();
});
beforeEach(() => {
  jest.clearAllMocks();
  changeAppState('active');
  useRingStore.setState({
    status: 'idle',
    devices: [],
    selectedDevice: null,
    errorMessage: null,
    syncError: null,
  });
  useRecordingStore.setState({ files: [], deletedUris: [] });
  (vendorModule().syncVoiceRecordings as jest.Mock).mockResolvedValue({
    files: [],
  });
});
afterEach(async () => {
  await ringConnectionService.disconnect();
  jest.useRealTimers();
});

test('native dispatch is not treated as an authenticated connection', async () => {
  const task = ringConnectionService.connect({
    id: 'AA:01',
    name: 'Recording Ring',
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(vendorModule().connect).toHaveBeenCalledWith('AA:01');
  expect(useRingStore.getState().status).toBe('connecting');
  emit('yanqiangVoiceConnectionChanged', {
    status: 'connected',
    macAddress: 'OTHER',
  });
  expect(useRingStore.getState().status).toBe('connecting');
  emit('yanqiangVoiceConnectionChanged', {
    status: 'connected',
    macAddress: 'AA:01',
  });
  await task;
  expect(useRingStore.getState().status).toBe('connected');
  emit('yanqiangVoiceConnectionChanged', {
    status: 'disconnected',
    macAddress: 'AA:01',
  });
  expect(useRingStore.getState().status).toBe('disconnected');
});

test('vendor errors reject connection instead of showing success', async () => {
  const task = ringConnectionService.connect({
    id: 'AA:02',
    name: 'Recording Ring',
  });
  const outcome = task.catch(error => error);
  await new Promise<void>(resolve => setImmediate(resolve));
  emit('yanqiangVoiceConnectionChanged', {
    status: 'error',
    macAddress: 'AA:02',
    message: '鉴权失败',
  });
  expect((await outcome).message).toBe('鉴权失败');
  expect(useRingStore.getState().status).toBe('failed');
});

test('scan deduplicates actual native results and stops cleanly', async () => {
  await ringConnectionService.scan();
  emit('yanqiangVoiceScanEvent', {
    type: 'device',
    macAddress: 'AA:03',
    name: 'Ring',
  });
  emit('yanqiangVoiceScanEvent', {
    type: 'device',
    macAddress: 'AA:03',
    name: 'Ring',
    rssi: -50,
  });
  expect(useRingStore.getState().devices).toHaveLength(1);
  expect(useRingStore.getState().devices[0].rssi).toBe(-50);
  ringConnectionService.stopScan();
  expect(useRingStore.getState().status).toBe('idle');
});

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
async function connected() {
  const task = ringConnectionService.connect({
    id: 'AA:AUTO',
    name: 'AIZO RING',
  });
  await flush();
  emit('yanqiangVoiceConnectionChanged', {
    status: 'connected',
    macAddress: 'AA:AUTO',
  });
  await task;
}
async function advance(ms = 1200) {
  jest.advanceTimersByTime(ms);
  await flush();
}
function status(value: string) {
  emit('yanqiangVoiceStatusUpdate', { status: value, function: 1 });
}

describe('foreground automatic recording sync', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  });
  test('checks once on authenticated connection, ignores repeated ready/idle echoes', async () => {
    await connected();
    expect(vendorModule().syncVoiceRecordings).not.toHaveBeenCalled();
    await advance();
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) {
      status('ready_to_sync');
      status('idle');
    }
    emit('yanqiangVoiceConnectionChanged', {
      status: 'connected',
      macAddress: 'AA:AUTO',
    });
    await advance(10000);
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
  });
  test('recording end synchronizes to the library without opening device page', async () => {
    await connected();
    await advance();
    const file = {
      name: 'auto.m4a',
      uri: 'file:///voice-recordings/auto.m4a',
      size: 100,
      timestamp: 1,
    };
    (vendorModule().syncVoiceRecordings as jest.Mock).mockResolvedValue({
      files: [file],
    });
    status('recording');
    await advance(10000);
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
    status('ready_to_sync');
    status('ready_to_sync');
    status('idle');
    await advance();
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(2);
    expect(useRecordingStore.getState().files).toEqual([
      { ...file, source: 'ring', commandRecordedAt: expect.any(Number) },
    ]);
    expect(useRingStore.getState().status).toBe('connected');
    expect(useRingStore.getState().syncProgress).toBe(100);
  });
  test('idle after recording also works, and a second recording gets its own sync', async () => {
    await connected();
    await advance();
    for (let i = 0; i < 2; i++) {
      status('recording');
      status('paused');
      status('idle');
      await advance();
    }
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(3);
  });
  test('background defers the scheduled sync and returning foreground checks only once', async () => {
    await connected();
    changeAppState('background');
    status('recording');
    status('ready_to_sync');
    await advance(10000);
    expect(vendorModule().syncVoiceRecordings).not.toHaveBeenCalled();
    changeAppState('active');
    changeAppState('active');
    await advance();
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
  });
  test('disconnect cancels pending sync and ignores late results', async () => {
    await connected();
    await ringConnectionService.disconnect();
    await advance();
    expect(vendorModule().syncVoiceRecordings).not.toHaveBeenCalled();
    await connected();
    let finish!: (value: unknown) => void;
    (vendorModule().syncVoiceRecordings as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await advance();
    await ringConnectionService.disconnect();
    finish({
      files: [{ uri: 'file:///late.m4a', name: 'late', timestamp: 1, size: 1 }],
    });
    await flush();
    expect(useRecordingStore.getState().files).toEqual([]);
    expect(useRingStore.getState().status).toBe('disconnected');
  });

  test('a new connection never accepts old file events and resumes its own pending sync', async () => {
    await connected();
    let finish!: (value: unknown) => void;
    (vendorModule().syncVoiceRecordings as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await advance();
    await ringConnectionService.disconnect();
    await connected();
    const lateFile = {
      uri: 'file:///late.m4a',
      name: 'late',
      size: 1,
      timestamp: 1,
    };
    emit('yanqiangVoiceFileReady', lateFile);
    expect(useRecordingStore.getState().files).toEqual([]);
    finish({ files: [lateFile] });
    await flush();
    await advance();
    expect(useRecordingStore.getState().files).toEqual([]);
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(2);
  });
  test('manual sync consumes pending auto sync, holding busy state through native conversion', async () => {
    await connected();
    let finish!: (value: unknown) => void;
    (vendorModule().syncVoiceRecordings as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const task = ringConnectionService.syncRecordings();
    emit('yanqiangVoiceConnectionChanged', {
      status: 'connecting',
      macAddress: 'AA:AUTO',
    });
    status('syncing');
    status('idle');
    status('ready_to_sync');
    emit('yanqiangVoiceConnectionChanged', {
      status: 'connected',
      macAddress: 'AA:AUTO',
    });
    expect(useRingStore.getState().status).toBe('syncing');
    await advance(10000);
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
    finish({ files: [] });
    await task;
    await advance(10000);
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
  });
  test('failure exposes home retry instead of repeatedly requesting', async () => {
    await connected();
    (vendorModule().syncVoiceRecordings as jest.Mock).mockRejectedValueOnce(
      new Error('transfer failed'),
    );
    await advance();
    expect(useRingStore.getState().syncError).toContain('同步未完成');
    status('ready_to_sync');
    status('idle');
    await advance(60000);
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
    await ringConnectionService.syncRecordings();
    expect(useRingStore.getState().syncError).toBeNull();
  });
  test('new recording ending during conversion queues one follow-up sync', async () => {
    await connected();
    let finish!: (value: unknown) => void;
    (vendorModule().syncVoiceRecordings as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await advance();
    status('recording');
    status('ready_to_sync');
    expect(useRingStore.getState().status).toBe('syncing');
    await advance();
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
    finish({ files: [] });
    await flush();
    await advance();
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(2);
  });
});

describe('connection recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  });
  afterEach(() => jest.restoreAllMocks());

  test('recording conversion errors preserve the live connection and subsequent status events', async () => {
    await connected();
    await advance();
    emit('yanqiangVoiceError', {
      scope: 'recording',
      code: 'YANQIANG_RECORDING_CONVERSION_FAILED',
      message: 'Opus to M4A failed',
      fileName: 'recording.opus',
    });
    expect(useRingStore.getState().status).toBe('connected');
    expect(useRingStore.getState().syncError).toBe('Opus to M4A failed');
    status('recording');
    expect(useRingStore.getState().status).toBe('recording');
  });

  test('legacy file errors also preserve the connection', async () => {
    await connected();
    emit('yanqiangVoiceError', { fileName: 'audio.ogg', message: 'disk full' });
    expect(useRingStore.getState().status).toBe('connected');
    expect(useRingStore.getState().syncError).toBe('disk full');
  });

  test('a ready event repairs a stale failure without restarting recording sync', async () => {
    await connected();
    await advance();
    useRingStore.getState().setStatus('failed');
    useRingStore.getState().setError('stale error');
    emit('yanqiangVoiceConnectionChanged', {
      status: 'connected',
      macAddress: 'AA:AUTO',
    });
    expect(useRingStore.getState().status).toBe('connected');
    expect(useRingStore.getState().errorMessage).toBeNull();
    await advance();
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
  });

  test('iOS UI timeout preserves native reconnect and accepts eventual authentication', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const task = ringConnectionService.connect({ id: 'UUID', name: 'Ring' });
    const outcome = task.catch(error => error);
    await flush();
    await advance(30000);
    expect((await outcome).message).toContain('连接超时');
    expect(vendorModule().disconnect).not.toHaveBeenCalled();
    emit('yanqiangVoiceConnectionChanged', {
      status: 'connected',
      macAddress: 'UUID',
      deviceMacAddress: 'AA:01',
    });
    expect(useRingStore.getState().status).toBe('connected');
  });

  test('explicit disconnect ignores late authentication and error callbacks', async () => {
    await connected();
    await ringConnectionService.disconnect();
    emit('yanqiangVoiceConnectionChanged', {
      status: 'connected',
      macAddress: 'AA:AUTO',
    });
    emit('yanqiangVoiceError', { message: 'late error' });
    changeAppState('background');
    changeAppState('active');
    await advance(60000);
    expect(useRingStore.getState().status).toBe('disconnected');
    expect(vendorModule().connect).toHaveBeenCalledTimes(1);
    expect(vendorModule().syncVoiceRecordings).not.toHaveBeenCalled();
  });

  test('connection errors invalidate authentication so native recovery starts a fresh sync', async () => {
    await connected();
    await advance();
    emit('yanqiangVoiceError', {
      scope: 'connection',
      code: 'YANQIANG_BLUETOOTH_OFF',
      message: 'Bluetooth off',
    });
    expect(useRingStore.getState().status).toBe('failed');
    status('recording');
    expect(useRingStore.getState().status).toBe('failed');
    emit('yanqiangVoiceConnectionChanged', {
      status: 'connected',
      macAddress: 'AA:AUTO',
    });
    await advance();
    expect(useRingStore.getState().status).toBe('connected');
    expect(useRingStore.getState().errorMessage).toBeNull();
    expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(2);
  });
});

test('native reconnect without a disconnect invalidates old sync and resumes after authentication', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  await connected();
  let finish!: (value: unknown) => void;
  (vendorModule().syncVoiceRecordings as jest.Mock).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await advance();
  emit('yanqiangVoiceConnectionChanged', {
    status: 'connecting',
    phase: 'connecting',
    macAddress: 'AA:AUTO',
  });
  expect(useRingStore.getState().status).toBe('connecting');
  finish({
    files: [{ uri: 'file:///stale.m4a', name: 'stale', timestamp: 1, size: 1 }],
  });
  await flush();
  expect(useRecordingStore.getState().files).toEqual([]);
  changeAppState('background');
  emit('yanqiangVoiceConnectionChanged', {
    status: 'connected',
    macAddress: 'AA:AUTO',
  });
  await advance(10000);
  expect(useRingStore.getState().status).toBe('connected');
  expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(1);
  changeAppState('active');
  await advance();
  expect(vendorModule().syncVoiceRecordings).toHaveBeenCalledTimes(2);
});
