import '@testing-library/jest-dom';

// Mock AudioContext for jsdom
class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.state = 'running';
    this.currentTime = 0;
  }
  createBuffer(channels, length, sampleRate) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: (_ch) => new Float32Array(length),
      copyToChannel: vi.fn()
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null
    };
  }
  decodeAudioData(arrayBuffer) {
    // Simulate decoded 1-second stereo audio at 44100 Hz
    const length = 44100;
    const buffer = {
      numberOfChannels: 2,
      length,
      sampleRate: 44100,
      duration: 1,
      getChannelData: (_ch) => new Float32Array(length).fill(0.1)
    };
    return Promise.resolve(buffer);
  }
  close() { return Promise.resolve(); }
  get destination() { return {}; }
}

globalThis.AudioContext = MockAudioContext;
globalThis.webkitAudioContext = MockAudioContext;

// Stub Web Workers
globalThis.Worker = class {
  constructor() {}
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
};

// Silence console.error in tests unless VERBOSE=1
if (!process.env.VERBOSE) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}
