/* ==========================================================================
   CLOUDBEATS - MUSIC STUDIO ENGINE & MIXING CONSOLE LOGIC (v4.0)
   Featuring: Childlike Toy Xylophone / Glockenspiel, Alexander Holm Piano,
   Virtual Acoustic Drum Kit, Color Customizer & Pro Mixer Console
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ------------------------------------------------------------------------
  // 1. WEB AUDIO CONTEXT & MIXER CHANNEL BUSES
  // ------------------------------------------------------------------------
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  let analyser = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let destNode = null;

  // Mixer Channel Audio Node Structures
  const channels = {
    master: { gain: null, panner: null, eqLow: null, eqMid: null, eqHigh: null, muted: false, volume: 0.85, pan: 0, peak: 0 },
    piano:  { gain: null, panner: null, eqLow: null, eqMid: null, eqHigh: null, muted: false, soloed: false, volume: 0.85, pan: 0, peak: 0 },
    drums:  { gain: null, panner: null, eqLow: null, eqMid: null, eqHigh: null, muted: false, soloed: false, volume: 0.85, pan: 0, peak: 0 },
    xylo:   { gain: null, panner: null, eqLow: null, eqMid: null, eqHigh: null, muted: false, soloed: false, volume: 0.85, pan: 0, peak: 0 },
    mic:    { gain: null, panner: null, eqLow: null, eqMid: null, eqHigh: null, muted: false, soloed: false, volume: 1.0,  pan: 0, peak: 0 }
  };

  function initAudioEngine() {
    if (audioCtx) return;
    audioCtx = new AudioContext();

    // Master Nodes
    channels.master.gain = audioCtx.createGain();
    channels.master.gain.gain.value = channels.master.volume;

    channels.master.panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

    channels.master.eqLow = audioCtx.createBiquadFilter();
    channels.master.eqLow.type = 'lowshelf';
    channels.master.eqLow.frequency.value = 250;

    channels.master.eqMid = audioCtx.createBiquadFilter();
    channels.master.eqMid.type = 'peaking';
    channels.master.eqMid.frequency.value = 1500;

    channels.master.eqHigh = audioCtx.createBiquadFilter();
    channels.master.eqHigh.type = 'highshelf';
    channels.master.eqHigh.frequency.value = 4000;

    let masterChain = channels.master.eqLow;
    channels.master.eqLow.connect(channels.master.eqMid);
    channels.master.eqMid.connect(channels.master.eqHigh);
    
    if (channels.master.panner) {
      channels.master.eqHigh.connect(channels.master.panner);
      channels.master.panner.connect(channels.master.gain);
    } else {
      channels.master.eqHigh.connect(channels.master.gain);
    }

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;

    destNode = audioCtx.createMediaStreamDestination();

    channels.master.gain.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.connect(destNode);

    // Instrument & Mic Channels
    ['piano', 'drums', 'xylo', 'mic'].forEach(chName => {
      const ch = channels[chName];
      ch.gain = audioCtx.createGain();
      ch.gain.gain.value = ch.volume;

      ch.panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

      ch.eqLow = audioCtx.createBiquadFilter();
      ch.eqLow.type = 'lowshelf';
      ch.eqLow.frequency.value = 250;

      ch.eqMid = audioCtx.createBiquadFilter();
      ch.eqMid.type = 'peaking';
      ch.eqMid.frequency.value = 1500;

      ch.eqHigh = audioCtx.createBiquadFilter();
      ch.eqHigh.type = 'highshelf';
      ch.eqHigh.frequency.value = 4000;

      ch.gain.connect(ch.eqLow);
      ch.eqLow.connect(ch.eqMid);
      ch.eqMid.connect(ch.eqHigh);

      if (chName === 'mic') {
        // Mic channel connects to destNode (recorder stream) to avoid feedback and ducking
        if (ch.panner) {
          ch.eqHigh.connect(ch.panner);
          ch.panner.connect(destNode);
        } else {
          ch.eqHigh.connect(destNode);
        }
      } else {
        if (ch.panner) {
          ch.eqHigh.connect(ch.panner);
          ch.panner.connect(masterChain);
        } else {
          ch.eqHigh.connect(masterChain);
        }
      }
    });

    document.getElementById('audioEngineStatus').textContent = 'Actif (' + audioCtx.sampleRate + ' Hz)';
    startVisualizer();
    startVUMeterLoop();
  }

  function ensureAudioContext() {
    if (!audioCtx) initAudioEngine();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function routeToChannel(channelName, signalNode) {
    ensureAudioContext();
    const ch = channels[channelName];
    if (ch && ch.gain) {
      signalNode.connect(ch.gain);
      ch.peak = Math.min(1, ch.peak + 0.6);
      channels.master.peak = Math.min(1, channels.master.peak + 0.4);
    } else {
      signalNode.connect(audioCtx.destination);
    }
  }

  function updateMixerRouting() {
    if (!audioCtx) return;

    const anySolo = ['piano', 'drums', 'xylo', 'mic'].some(ch => channels[ch].soloed);

    ['piano', 'drums', 'xylo', 'mic'].forEach(chName => {
      const ch = channels[chName];
      let targetGain = ch.volume;

      if (ch.muted) {
        targetGain = 0;
      } else if (anySolo && !ch.soloed) {
        targetGain = 0;
      }

      ch.gain.gain.setValueAtTime(targetGain, audioCtx.currentTime);
    });

    const m = channels.master;
    m.gain.gain.setValueAtTime(m.muted ? 0 : m.volume, audioCtx.currentTime);
  }

  function startVUMeterLoop() {
    function animateVU() {
      requestAnimationFrame(animateVU);

      ['master', 'piano', 'drums', 'xylo', 'mic'].forEach(chName => {
        const ch = channels[chName];
        const bar = document.getElementById(`vu-${chName}`);
        if (bar) {
          ch.peak *= 0.85;
          const percent = Math.min(100, Math.round(ch.peak * 100));
          bar.style.height = `${percent}%`;
        }
      });
    }
    animateVU();
  }

  // ------------------------------------------------------------------------
  // 2. CANVAS AUDIO SPECTRUM & NEON WAVE VISUALIZER
  // ------------------------------------------------------------------------
  const canvas = document.getElementById('visualizerCanvas');
  const canvasCtx = canvas ? canvas.getContext('2d') : null;
  let visualizerLoopRunning = false;
  let idlePhase = 0;

  function startVisualizer() {
    if (visualizerLoopRunning || !canvas || !canvasCtx) return;
    visualizerLoopRunning = true;

    function draw() {
      requestAnimationFrame(draw);

      // Auto-fit canvas resolution to parent container
      if (canvas.parentElement) {
        const parentW = canvas.parentElement.clientWidth;
        const parentH = canvas.parentElement.clientHeight;
        if (parentW > 0 && canvas.width !== parentW) canvas.width = parentW;
        if (parentH > 0 && canvas.height !== parentH) canvas.height = parentH;
      }

      const width = canvas.width || 400;
      const height = canvas.height || 48;

      canvasCtx.clearRect(0, 0, width, height);

      let isSoundActive = false;
      let bufferLength = 64;
      let freqData = null;
      let timeData = null;

      if (analyser) {
        bufferLength = analyser.frequencyBinCount;
        freqData = new Uint8Array(bufferLength);
        timeData = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);

        for (let i = 0; i < bufferLength; i++) {
          if (freqData[i] > 8) {
            isSoundActive = true;
            break;
          }
        }
      }

      // 1. Draw Spectrum Equalizer Bars
      const numBars = 32;
      const barWidth = width / numBars;

      for (let i = 0; i < numBars; i++) {
        let percent = 0.04;
        if (freqData) {
          const index = Math.floor((i / numBars) * bufferLength);
          percent = freqData[index] / 255;
        }
        const barHeight = Math.max(3, percent * height);

        const grad = canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, 'rgba(249, 115, 22, 0.25)');
        grad.addColorStop(0.5, 'rgba(251, 146, 60, 0.75)');
        grad.addColorStop(1, 'rgba(251, 191, 36, 0.95)');

        canvasCtx.fillStyle = grad;
        canvasCtx.fillRect(i * barWidth, height - barHeight, barWidth - 2, barHeight);
      }

      // 2. Draw Live Oscilloscope Sound Waves (Cyan Neon Line)
      canvasCtx.lineWidth = isSoundActive ? 3 : 2;
      canvasCtx.strokeStyle = isSoundActive ? '#00f2fe' : 'rgba(0, 242, 254, 0.6)';
      canvasCtx.shadowBlur = isSoundActive ? 12 : 4;
      canvasCtx.shadowColor = '#00f2fe';

      canvasCtx.beginPath();
      const points = 64;
      const sliceWidth = width / points;
      let x = 0;

      idlePhase += 0.06;

      for (let i = 0; i < points; i++) {
        let v = 1.0;
        if (isSoundActive && timeData) {
          const index = Math.floor((i / points) * timeData.length);
          v = timeData[index] / 128.0;
        } else {
          v = 1.0 + Math.sin(idlePhase + i * 0.25) * 0.12;
        }

        const y = (v * height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.stroke();
      canvasCtx.shadowBlur = 0;
    }

    draw();
  }

  // ------------------------------------------------------------------------
  // 3. SAMPLE STORAGE & SAMPLE BANKS
  // ------------------------------------------------------------------------
  const customSamples = {
    drums: {},
    xylophone: {},
    piano: {}
  };

  const pianoSampleBank = {};
  const xyloSampleBank = {};
  const toyGlockenSampleBank = {};

  const pianoRefNotes = [
    { note: 'C2', freq: 65.41 }, { note: 'F2', freq: 87.31 },
    { note: 'C3', freq: 130.81 }, { note: 'F3', freq: 174.61 }, { note: 'A3', freq: 220.00 },
    { note: 'C4', freq: 261.63 }, { note: 'E4', freq: 329.63 }, { note: 'G4', freq: 392.00 },
    { note: 'C5', freq: 523.25 }, { note: 'E5', freq: 659.25 }, { note: 'G5', freq: 783.99 },
    { note: 'C6', freq: 1046.50 }
  ];

  const xyloRefNotes = [
    { note: 'C4', freq: 261.63 },
    { note: 'F4', freq: 349.23 },
    { note: 'C5', freq: 523.25 },
    { note: 'F5', freq: 698.46 },
    { note: 'C6', freq: 1046.50 }
  ];

  const loadedSampleNames = [];

  async function loadAudioBufferFromFile(file) {
    ensureAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  }

  async function attemptFetchSample(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      if (!audioCtx) initAudioEngine();
      return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
      return null;
    }
  }

  // Preload Alexander Holm Grand Piano MP3 Samples
  async function preloadAlexanderHolmPiano() {
    const primaryCdn = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/';
    const fallbackCdn = 'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/acoustic_grand_piano-mp3/';

    let loadedCount = 0;
    for (const ref of pianoRefNotes) {
      let buffer = await attemptFetchSample(`${primaryCdn}${ref.note}.mp3`);
      if (!buffer) buffer = await attemptFetchSample(`${fallbackCdn}${ref.note}.mp3`);

      if (buffer) {
        pianoSampleBank[ref.note] = { buffer: buffer, freq: ref.freq };
        loadedCount++;
      }
    }

    if (loadedCount > 0) {
      registerLoadedSample(`Grand Piano Alexander Holm HQ (${loadedCount} samples)`, 'Piano');
    }
  }

  // Preload Acoustic Xylophone & Childlike Toy Glockenspiel Samples
  async function preloadXylophoneSamples() {
    const xyloCdn = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/xylophone-mp3/';
    const glockCdn = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/glockenspiel-mp3/';

    let loadedCount = 0;
    for (const ref of xyloRefNotes) {
      let bufferXylo = await attemptFetchSample(`${xyloCdn}${ref.note}.mp3`);
      let bufferGlock = await attemptFetchSample(`${glockCdn}${ref.note}.mp3`);

      if (bufferXylo) {
        xyloSampleBank[ref.note] = { buffer: bufferXylo, freq: ref.freq };
        loadedCount++;
      }
      if (bufferGlock) {
        toyGlockenSampleBank[ref.note] = { buffer: bufferGlock, freq: ref.freq };
      }
    }

    if (loadedCount > 0) {
      registerLoadedSample(`Xylophone Enfantin & Glockenspiel HQ`, 'Xylophone');
    }
  }

  async function preloadLocalFolderSamples() {
    ensureAudioContext();

    const drumKeys = ['kick', 'snare', 'hihat', 'openhat', 'tom1', 'tom2', 'crash', 'ride', 'clap'];
    for (const key of drumKeys) {
      const bufferWav = await attemptFetchSample(`audio/drums/${key}.wav`);
      const bufferMp3 = bufferWav || await attemptFetchSample(`audio/drums/${key}.mp3`);
      if (bufferMp3) {
        customSamples.drums[key] = bufferMp3;
        registerLoadedSample(`audio/drums/${key}`, 'Batterie');
      }
    }

    const xyloNotes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
    for (const note of xyloNotes) {
      const nLower = note.toLowerCase();
      const bufferWav = await attemptFetchSample(`audio/xylophone/${nLower}.wav`);
      const bufferMp3 = bufferWav || await attemptFetchSample(`audio/xylophone/${nLower}.mp3`);
      if (bufferMp3) {
        customSamples.xylophone[note] = bufferMp3;
        registerLoadedSample(`audio/xylophone/${nLower}`, 'Xylophone');
      }
    }

    preloadAlexanderHolmPiano();
    preloadXylophoneSamples();
  }

  function registerLoadedSample(name, category) {
    loadedSampleNames.push({ name, category, time: new Date().toLocaleTimeString() });
    updateSamplesTable();
  }

  function updateSamplesTable() {
    const table = document.getElementById('samplesTable');
    if (loadedSampleNames.length === 0) {
      table.innerHTML = `<div class="empty-samples">Aucun fichier sur mesure chargé.</div>`;
      return;
    }

    table.innerHTML = loadedSampleNames.map(s => `
      <div class="sample-row">
        <span><i class="fa-solid fa-file-audio text-piano"></i> <strong>${s.name}</strong></span>
        <span class="sample-tag">${s.category}</span>
        <span style="font-size: 11px; color: var(--text-muted);">${s.time}</span>
      </div>
    `).join('');
  }

  // ------------------------------------------------------------------------
  // 4. ACOUSTIC GRAND PIANO PLAYER
  // ------------------------------------------------------------------------
  function getBestPianoSample(targetFreq) {
    const keys = Object.keys(pianoSampleBank);
    if (keys.length === 0) return null;

    let bestKey = keys[0];
    let minDiff = Math.abs(targetFreq - pianoSampleBank[bestKey].freq);

    for (const k of keys) {
      const diff = Math.abs(targetFreq - pianoSampleBank[k].freq);
      if (diff < minDiff) {
        minDiff = diff;
        bestKey = k;
      }
    }

    const sampleObj = pianoSampleBank[bestKey];
    return { buffer: sampleObj.buffer, rate: targetFreq / sampleObj.freq };
  }

  function playPianoNote(targetFreq, noteName = 'C4') {
    ensureAudioContext();

    const sampleMatch = getBestPianoSample(targetFreq);

    if (sampleMatch) {
      const source = audioCtx.createBufferSource();
      source.buffer = sampleMatch.buffer;
      source.playbackRate.value = sampleMatch.rate;

      const gainNode = audioCtx.createGain();
      const filterNode = audioCtx.createBiquadFilter();

      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(Math.min(18000, targetFreq * 6), audioCtx.currentTime);

      const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
      const panVal = Math.max(-0.6, Math.min(0.6, (Math.log2(targetFreq / 261.63) * 0.3)));
      if (panner) panner.pan.setValueAtTime(panVal, audioCtx.currentTime);

      const decayTime = sustainActive ? 4.5 : 2.0;
      gainNode.gain.setValueAtTime(0.9, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + decayTime);

      source.connect(filterNode);
      if (panner) {
        filterNode.connect(panner);
        routeToChannel('piano', panner);
      } else {
        routeToChannel('piano', filterNode);
      }

      source.start(0);
      return;
    }

    // Physical Piano Resonator Fallback
    const now = audioCtx.currentTime;
    const hammerBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.015, audioCtx.sampleRate);
    const hammerData = hammerBuffer.getChannelData(0);
    for (let i = 0; i < hammerData.length; i++) {
      hammerData[i] = (Math.random() * 2 - 1) * Math.exp(-i / 100);
    }
    const hammerSource = audioCtx.createBufferSource();
    hammerSource.buffer = hammerBuffer;
    const hammerGain = audioCtx.createGain();
    hammerGain.gain.setValueAtTime(0.5, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    hammerSource.connect(hammerGain);
    routeToChannel('piano', hammerGain);
    hammerSource.start(now);

    const harmonics = [1, 2.001, 3.003, 4.008];
    const gains = [0.8, 0.35, 0.15, 0.08];

    const masterNoteGain = audioCtx.createGain();
    const decayTime = sustainActive ? 3.8 : 1.5;

    masterNoteGain.gain.setValueAtTime(0.001, now);
    masterNoteGain.gain.linearRampToValueAtTime(0.85, now + 0.008);
    masterNoteGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

    harmonics.forEach((hMult, idx) => {
      const osc = audioCtx.createOscillator();
      const hGain = audioCtx.createGain();

      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(targetFreq * hMult, now);

      hGain.gain.value = gains[idx];
      osc.connect(hGain);
      hGain.connect(masterNoteGain);

      osc.start(now);
      osc.stop(now + decayTime);
    });

    routeToChannel('piano', masterNoteGain);
  }

  // ------------------------------------------------------------------------
  // 5. DRUMS SYNTHESIZER
  // ------------------------------------------------------------------------
  function playDrumSound(type) {
    ensureAudioContext();

    if (customSamples.drums[type]) {
      const source = audioCtx.createBufferSource();
      source.buffer = customSamples.drums[type];
      routeToChannel('drums', source);
      source.start(0);
      return;
    }

    const now = audioCtx.currentTime;

    switch (type) {
      case 'kick': {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
        gain.gain.setValueAtTime(1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        routeToChannel('drums', gain);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      case 'snare': {
        const bufferSize = audioCtx.sampleRate * 0.2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.8, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
        oscGain.gain.setValueAtTime(0.6, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        routeToChannel('drums', noiseGain);

        osc.connect(oscGain);
        routeToChannel('drums', oscGain);

        noise.start(now);
        osc.start(now);
        noise.stop(now + 0.2);
        osc.stop(now + 0.15);
        break;
      }
      case 'hihat':
      case 'openhat': {
        const duration = type === 'openhat' ? 0.35 : 0.08;
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        source.connect(filter);
        filter.connect(gain);
        routeToChannel('drums', gain);
        source.start(now);
        break;
      }
      case 'tom1':
      case 'tom2': {
        const freq = type === 'tom1' ? 140 : 90;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + 0.25);
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        routeToChannel('drums', gain);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
      case 'crash':
      case 'ride': {
        const duration = type === 'crash' ? 1.2 : 0.8;
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = type === 'crash' ? 5500 : 8000;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        routeToChannel('drums', gain);
        source.start(now);
        break;
      }
      case 'clap': {
        const duration = 0.2;
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        source.connect(filter);
        filter.connect(gain);
        routeToChannel('drums', gain);
        source.start(now);
        break;
      }
    }
  }

  // ------------------------------------------------------------------------
  // 6. XYLOPHONE PLAYER (CHILDLIKE TOY GLOCKENSPIEL vs ACOUSTIC CONCERT)
  // ------------------------------------------------------------------------
  function getBestSampleFromBank(bank, targetFreq) {
    const keys = Object.keys(bank);
    if (keys.length === 0) return null;

    let bestKey = keys[0];
    let minDiff = Math.abs(targetFreq - bank[bestKey].freq);

    for (const k of keys) {
      const diff = Math.abs(targetFreq - bank[k].freq);
      if (diff < minDiff) {
        minDiff = diff;
        bestKey = k;
      }
    }

    const sampleObj = bank[bestKey];
    return { buffer: sampleObj.buffer, rate: targetFreq / sampleObj.freq };
  }

  // ---- Synthetic Room Reverb (short convolution via noise IR) ----
  function createShortReverb(durationSec = 0.4, decay = 3.0) {
    const sampleRate = audioCtx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const impulse = audioCtx.createBuffer(2, length, sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    const convolver = audioCtx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  function playXylophoneNote(targetFreq, noteName = 'C4') {
    ensureAudioContext();

    const isChildlikeMode = document.getElementById('xyloSoundMode')?.value === 'childlike';
    const now = audioCtx.currentTime;

    // --- Real Acoustic Recorded Xylophone Samples (Local Folder / Custom Samples) ---
    const upperNote = noteName ? noteName.toUpperCase() : 'C4';
    const customSampleBuffer = customSamples.xylophone[upperNote] || customSamples.xylophone[noteName];

    if (customSampleBuffer) {
      const source = audioCtx.createBufferSource();
      source.buffer = customSampleBuffer;
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.95, now);
      source.connect(gainNode);
      routeToChannel('xylo', gainNode);
      source.start(0);
      return;
    }

    // --- Sample Bank playback (when CDN samples loaded) ---
    if (isChildlikeMode) {
      const glockMatch = getBestSampleFromBank(toyGlockenSampleBank, targetFreq);
      if (glockMatch) {
        const source = audioCtx.createBufferSource();
        source.buffer = glockMatch.buffer;
        source.playbackRate.value = glockMatch.rate;
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(1.0, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        source.connect(gainNode);
        // Add gentle shimmer reverb
        const rev = createShortReverb(0.6, 2.5);
        const revGain = audioCtx.createGain();
        revGain.gain.value = 0.25;
        gainNode.connect(rev);
        rev.connect(revGain);
        routeToChannel('xylo', gainNode);
        routeToChannel('xylo', revGain);
        source.start(0);
        return;
      }
    } else {
      const xyloMatch = getBestSampleFromBank(xyloSampleBank, targetFreq);
      if (xyloMatch) {
        const source = audioCtx.createBufferSource();
        source.buffer = xyloMatch.buffer;
        source.playbackRate.value = xyloMatch.rate;
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.95, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        source.connect(gainNode);
        routeToChannel('xylo', gainNode);
        source.start(0);
        return;
      }
    }

    // --- Synthesizer Fallback ---
    if (isChildlikeMode) {
      // ✨ CHILDLIKE: Toy Glockenspiel — bright metallic bell with shimmer
      // Mallet transient (click)
      const clickBuf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.006), audioCtx.sampleRate);
      const clickData = clickBuf.getChannelData(0);
      for (let i = 0; i < clickData.length; i++) {
        clickData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / clickData.length, 2);
      }
      const clickSrc = audioCtx.createBufferSource();
      clickSrc.buffer = clickBuf;
      const clickGain = audioCtx.createGain();
      clickGain.gain.setValueAtTime(0.6, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.006);
      clickSrc.connect(clickGain);
      routeToChannel('xylo', clickGain);
      clickSrc.start(now);

      // Bell tone: harmonic series of a toy metallophone
      // Ratios based on real glockenspiel modes: 1.0, 2.76, 5.40, 8.93, 13.35
      const bellModes  = [1.0,   2.76,  5.40,  8.93];
      const bellAmps   = [1.0,   0.55,  0.28,  0.10];
      const bellDecays = [2.2,   1.4,   0.65,  0.25];

      const masterBell = audioCtx.createGain();
      masterBell.gain.value = 0.85;

      bellModes.forEach((ratio, i) => {
        const osc = audioCtx.createOscillator();
        const g   = audioCtx.createGain();
        osc.type = 'sine';
        // Tiny pitch glide up from impact
        osc.frequency.setValueAtTime(targetFreq * ratio * 1.003, now);
        osc.frequency.exponentialRampToValueAtTime(targetFreq * ratio, now + 0.015);
        g.gain.setValueAtTime(bellAmps[i], now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + bellDecays[i]);
        osc.connect(g);
        g.connect(masterBell);
        osc.start(now);
        osc.stop(now + bellDecays[i] + 0.05);
      });

      // Bright shimmer reverb
      const rev = createShortReverb(0.5, 2.8);
      const revMix = audioCtx.createGain();
      revMix.gain.value = 0.3;
      masterBell.connect(rev);
      rev.connect(revMix);

      // High-shelf brightness boost
      const shelf = audioCtx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 4000;
      shelf.gain.value = 6;
      masterBell.connect(shelf);

      routeToChannel('xylo', shelf);
      routeToChannel('xylo', revMix);

    } else {
      // 🪵 CONCERT: Acoustic Marimba — warm rosewood resonance
      // Hard mallet transient
      const malletBuf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.010), audioCtx.sampleRate);
      const malletData = malletBuf.getChannelData(0);
      for (let i = 0; i < malletData.length; i++) {
        malletData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (malletData.length * 0.15));
      }
      const malletSrc = audioCtx.createBufferSource();
      malletSrc.buffer = malletBuf;
      const malletGain = audioCtx.createGain();
      malletGain.gain.setValueAtTime(0.5, now);
      malletGain.gain.exponentialRampToValueAtTime(0.001, now + 0.010);
      malletSrc.connect(malletGain);
      routeToChannel('xylo', malletGain);
      malletSrc.start(now);

      // Marimba acoustic mode ratios: 1.0, 3.97, 9.87 (real rosewood bar)
      const woodModes  = [1.0,   3.97,  9.87];
      const woodAmps   = [1.0,   0.22,  0.06];
      const woodDecays = [1.1,   0.35,  0.10];

      const masterWood = audioCtx.createGain();
      masterWood.gain.value = 0.9;

      woodModes.forEach((ratio, i) => {
        const osc  = audioCtx.createOscillator();
        const g    = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(targetFreq * ratio, now);
        g.gain.setValueAtTime(woodAmps[i], now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + woodDecays[i]);
        osc.connect(g);
        g.connect(masterWood);
        osc.start(now);
        osc.stop(now + woodDecays[i] + 0.05);
      });

      // Warm low-pass (rosewood warmth)
      const warmth = audioCtx.createBiquadFilter();
      warmth.type = 'lowpass';
      warmth.frequency.value = Math.min(12000, targetFreq * 8);
      warmth.Q.value = 0.5;
      masterWood.connect(warmth);

      // Tube resonator body
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = targetFreq;
      bp.Q.value = 8;
      masterWood.connect(bp);

      // Short room tail
      const rev = createShortReverb(0.25, 4.0);
      const revMix = audioCtx.createGain();
      revMix.gain.value = 0.18;
      warmth.connect(rev);
      rev.connect(revMix);

      routeToChannel('xylo', warmth);
      routeToChannel('xylo', bp);
      routeToChannel('xylo', revMix);
    }
  }

  // ------------------------------------------------------------------------
  // 7. COLOR CUSTOMIZER ENGINE
  // ------------------------------------------------------------------------
  const pianoThemePreset = document.getElementById('pianoThemePreset');
  const pianoCustomColor = document.getElementById('pianoCustomColor');

  const xyloThemePreset = document.getElementById('xyloThemePreset');
  const xyloCustomColor = document.getElementById('xyloCustomColor');

  function applyPianoColor(hexColor) {
    document.documentElement.style.setProperty('--color-piano', hexColor);
    document.documentElement.style.setProperty('--piano-key-glow', `${hexColor}cc`);
  }

  pianoThemePreset.addEventListener('change', (e) => {
    const val = e.target.value;
    let hex = '#f97316'; // orange (default)
    if (val === 'amber') hex = '#f59e0b';
    else if (val === 'red') hex = '#ef4444';
    else if (val === 'cyan') hex = '#06b6d4';
    else if (val === 'purple') hex = '#a855f7';

    pianoCustomColor.value = hex;
    applyPianoColor(hex);
  });

  pianoCustomColor.addEventListener('input', (e) => {
    applyPianoColor(e.target.value);
  });

  function applyXyloTheme(preset, customHex) {
    const root = document.documentElement;
    root.style.setProperty('--color-xylo', customHex);
    root.style.setProperty('--xylo-bar-glow', `${customHex}cc`);

    const bars = document.querySelectorAll('.xylo-bar');
    bars.forEach((bar, idx) => {
      if (preset === 'wood') {
        const colors = ['#854d0e', '#a16207', '#ca8a04', '#d97706', '#b45309', '#92400e', '#78350f'];
        const col = colors[idx % colors.length];
        bar.style.background = `linear-gradient(180deg, ${col} 0%, #2b1810 100%)`;
      } else if (preset === 'rainbow') {
        const rainbow = ['#ff2a6d', '#ff5e00', '#ffb703', '#00f2fe', '#05d5a8', '#3b82f6', '#8b5cf6', '#ec4899'];
        const col = rainbow[idx % rainbow.length];
        bar.style.background = `linear-gradient(180deg, ${col} 0%, #1a1024 100%)`;
      } else if (preset === 'gold') {
        bar.style.background = `linear-gradient(180deg, #fef08a 0%, #ca8a04 50%, #451a03 100%)`;
      } else if (preset === 'pastel') {
        const pastels = ['#f472b6', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#c084fc'];
        const col = pastels[idx % pastels.length];
        bar.style.background = `linear-gradient(180deg, ${col} 0%, #1e293b 100%)`;
      } else {
        bar.style.background = `linear-gradient(180deg, ${customHex} 0%, #1a1005 100%)`;
      }
    });
  }

  xyloThemePreset.addEventListener('change', (e) => {
    applyXyloTheme(e.target.value, xyloCustomColor.value);
  });

  xyloCustomColor.addEventListener('input', (e) => {
    applyXyloTheme('custom', e.target.value);
  });

  // ------------------------------------------------------------------------
  // 8. PIANO KEYBOARD UI & LOGIC (2-OCTAVE PHYSICAL KEYBOARD MAPPING)
  // ------------------------------------------------------------------------
  let currentOctave = 4;
  let sustainActive = true;

  const pianoLowerKeys = [
    { note: 'C', isBlack: false, key: 'z' },
    { note: 'C#', isBlack: true, key: 's' },
    { note: 'D', isBlack: false, key: 'x' },
    { note: 'D#', isBlack: true, key: 'd' },
    { note: 'E', isBlack: false, key: 'c' },
    { note: 'F', isBlack: false, key: 'v' },
    { note: 'F#', isBlack: true, key: 'g' },
    { note: 'G', isBlack: false, key: 'b' },
    { note: 'G#', isBlack: true, key: 'h' },
    { note: 'A', isBlack: false, key: 'n' },
    { note: 'A#', isBlack: true, key: 'j' },
    { note: 'B', isBlack: false, key: 'm' }
  ];

  const pianoUpperKeys = [
    { note: 'C', isBlack: false, key: 'q' },
    { note: 'C#', isBlack: true, key: '2' },
    { note: 'D', isBlack: false, key: 'w' },
    { note: 'D#', isBlack: true, key: '3' },
    { note: 'E', isBlack: false, key: 'e' },
    { note: 'F', isBlack: false, key: 'r' },
    { note: 'F#', isBlack: true, key: '5' },
    { note: 'G', isBlack: false, key: 't' },
    { note: 'G#', isBlack: true, key: '6' },
    { note: 'A', isBlack: false, key: 'y' },
    { note: 'A#', isBlack: true, key: '7' },
    { note: 'B', isBlack: false, key: 'u' }
  ];

  function getNoteFrequency(noteWithOctave) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const note = noteWithOctave.slice(0, -1);
    const oct = parseInt(noteWithOctave.slice(-1));
    const noteIndex = notes.indexOf(note);
    const halfStepsFromA4 = (oct - 4) * 12 + noteIndex - 9;
    return 440 * Math.pow(2, halfStepsFromA4 / 12);
  }

  function renderPianoKeyboard() {
    const container = document.getElementById('pianoKeyboard');
    if (!container) return;
    container.innerHTML = '';

    const octavesToRender = [
      { oct: currentOctave, keys: pianoLowerKeys },
      { oct: currentOctave + 1, keys: pianoUpperKeys }
    ];
    let whiteKeyIndex = 0;

    octavesToRender.forEach(({ oct, keys }) => {
      keys.forEach((n) => {
        const fullNote = `${n.note}${oct}`;
        const keyEl = document.createElement('div');

        if (n.isBlack) {
          keyEl.className = 'key-black';
          keyEl.style.left = `${(whiteKeyIndex * 44) - 14 + 16}px`;
        } else {
          keyEl.className = 'key-white';
          whiteKeyIndex++;
        }

        keyEl.dataset.note = fullNote;
        keyEl.innerHTML = `
          <span class="key-label">${fullNote}</span>
          <span class="key-shortcut">${n.key.toUpperCase()}</span>
        `;

        keyEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          triggerPianoKey(fullNote, keyEl);
        });

        container.appendChild(keyEl);
      });
    });
  }

  function triggerPianoKey(note, keyElement = null) {
    const freq = getNoteFrequency(note);
    playPianoNote(freq, note);

    if (!keyElement) {
      keyElement = document.querySelector(`[data-note="${note}"]`);
    }

    if (keyElement) {
      keyElement.classList.add('active');
      setTimeout(() => keyElement.classList.remove('active'), 150);
    }
  }

  document.getElementById('sustainBtn').addEventListener('click', (e) => {
    sustainActive = !sustainActive;
    e.currentTarget.classList.toggle('active', sustainActive);
  });

  document.getElementById('octaveDownBtn').addEventListener('click', () => {
    if (currentOctave > 2) {
      currentOctave--;
      document.getElementById('octaveDisplay').textContent = currentOctave;
      renderPianoKeyboard();
    }
  });

  document.getElementById('octaveUpBtn').addEventListener('click', () => {
    if (currentOctave < 6) {
      currentOctave++;
      document.getElementById('octaveDisplay').textContent = currentOctave;
      renderPianoKeyboard();
    }
  });

  // ------------------------------------------------------------------------
  // 9. VIRTUAL DRUM KIT UI & INTERACTIONS
  // ------------------------------------------------------------------------
  const drumElements = document.querySelectorAll('.drum-element');

  drumElements.forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const type = el.dataset.type;
      triggerDrumElement(type, el);
    });
  });

  function triggerDrumElement(type, el = null) {
    playDrumSound(type);

    if (!el) {
      el = document.querySelector(`.drum-element[data-type="${type}"]`);
    }
    if (el) {
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 120);
    }
  }

  // ------------------------------------------------------------------------
  // 10. XYLOPHONE UI & MULTI-NOTATION ENGINE (SOLFÈGE, LETTERS, OCTAVES, NUMBERS)
  // ------------------------------------------------------------------------
  const xyloBarsConfig = [
    { note: 'C4', solfège: 'Do 4', letters: 'C', octaves: 'C4', numbers: '1', key: 'z', height: 180 },
    { note: 'D4', solfège: 'Ré 4', letters: 'D', octaves: 'D4', numbers: '2', key: 'x', height: 172 },
    { note: 'E4', solfège: 'Mi 4', letters: 'E', octaves: 'E4', numbers: '3', key: 'c', height: 164 },
    { note: 'F4', solfège: 'Fa 4', letters: 'F', octaves: 'F4', numbers: '4', key: 'v', height: 156 },
    { note: 'G4', solfège: 'Sol 4', letters: 'G', octaves: 'G4', numbers: '5', key: 'b', height: 148 },
    { note: 'A4', solfège: 'La 4', letters: 'A', octaves: 'A4', numbers: '6', key: 'n', height: 140 },
    { note: 'B4', solfège: 'Si 4', letters: 'B', octaves: 'B4', numbers: '7', key: 'm', height: 132 },
    { note: 'C5', solfège: 'Do 5', letters: 'C', octaves: 'C5', numbers: '8', key: 'q', height: 124 },
    { note: 'D5', solfège: 'Ré 5', letters: 'D', octaves: 'D5', numbers: '9', key: 'w', height: 116 },
    { note: 'E5', solfège: 'Mi 5', letters: 'E', octaves: 'E5', numbers: '10', key: 'e', height: 108 },
    { note: 'F5', solfège: 'Fa 5', letters: 'F', octaves: 'F5', numbers: '11', key: 'r', height: 100 },
    { note: 'G5', solfège: 'Sol 5', letters: 'G', octaves: 'G5', numbers: '12', key: 't', height: 92 },
    { note: 'A5', solfège: 'La 5', letters: 'A', octaves: 'A5', numbers: '13', key: 'y', height: 84 },
    { note: 'B5', solfège: 'Si 5', letters: 'B', octaves: 'B5', numbers: '14', key: 'u', height: 76 },
    { note: 'C6', solfège: 'Do 6', letters: 'C', octaves: 'C6', numbers: '15', key: 'i', height: 68 }
  ];

  function renderXylophone() {
    const container = document.getElementById('xyloBarsContainer');
    if (!container) return;
    container.innerHTML = '';

    const notationSystem = document.getElementById('xyloNotationSelect')?.value || 'solfège';

    xyloBarsConfig.forEach(bar => {
      const barEl = document.createElement('div');
      barEl.className = 'xylo-bar';
      barEl.dataset.note = bar.note;
      barEl.style.height = `${bar.height}px`;
      barEl.style.width = `38px`;

      const displayLabel = bar[notationSystem] || bar.solfège;

      barEl.innerHTML = `
        <span class="pin"></span>
        <span class="xylo-note">${displayLabel}</span>
        <span class="pin"></span>
        <span class="xylo-shortcut">${bar.key.toUpperCase()}</span>
      `;

      barEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        triggerXyloBar(bar.note, barEl);
      });

      container.appendChild(barEl);
    });

    if (xyloThemePreset && xyloCustomColor) {
      applyXyloTheme(xyloThemePreset.value, xyloCustomColor.value);
    }
  }

  document.getElementById('xyloNotationSelect')?.addEventListener('change', () => {
    renderXylophone();
  });

  function triggerXyloBar(note, barEl = null) {
    const freq = getNoteFrequency(note);
    playXylophoneNote(freq, note);

    if (!barEl) {
      barEl = document.querySelector(`.xylo-bar[data-note="${note}"]`);
    }
    if (barEl) {
      barEl.classList.add('active');
      setTimeout(() => barEl.classList.remove('active'), 120);
    }
  }

  // ------------------------------------------------------------------------
  // 11. CONSOLE DE MIXAGE CONTROLS
  // ------------------------------------------------------------------------
  document.querySelectorAll('.fader-vol').forEach(fader => {
    fader.addEventListener('input', (e) => {
      const ch = e.target.dataset.ch;
      const val = parseFloat(e.target.value);
      channels[ch].volume = val;

      const label = document.getElementById(`val-${ch}`);
      if (label) label.textContent = `${Math.round(val * 100)}%`;

      updateMixerRouting();
    });
  });

  document.querySelectorAll('.knob-pan').forEach(knob => {
    knob.addEventListener('input', (e) => {
      const ch = e.target.dataset.ch;
      const val = parseFloat(e.target.value);
      channels[ch].pan = val;

      if (channels[ch].panner && audioCtx) {
        channels[ch].panner.pan.setValueAtTime(val, audioCtx.currentTime);
      }

      const valLabel = e.target.nextElementSibling;
      if (valLabel) {
        if (val === 0) valLabel.textContent = 'C';
        else if (val < 0) valLabel.textContent = `L${Math.abs(Math.round(val * 100))}`;
        else valLabel.textContent = `R${Math.round(val * 100)}`;
      }
    });
  });

  document.querySelectorAll('.knob-eq').forEach(eq => {
    eq.addEventListener('input', (e) => {
      const ch = e.target.dataset.ch;
      const band = e.target.dataset.eq;
      const gainDb = parseFloat(e.target.value);

      if (!audioCtx) initAudioEngine();

      if (band === 'low' && channels[ch].eqLow) {
        channels[ch].eqLow.gain.setValueAtTime(gainDb, audioCtx.currentTime);
      } else if (band === 'mid' && channels[ch].eqMid) {
        channels[ch].eqMid.gain.setValueAtTime(gainDb, audioCtx.currentTime);
      } else if (band === 'high' && channels[ch].eqHigh) {
        channels[ch].eqHigh.gain.setValueAtTime(gainDb, audioCtx.currentTime);
      }
    });
  });

  document.querySelectorAll('.btn-mute').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ch = e.target.dataset.ch;
      channels[ch].muted = !channels[ch].muted;
      e.target.classList.toggle('active', channels[ch].muted);
      updateMixerRouting();
    });
  });

  document.querySelectorAll('.btn-solo').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const ch = e.target.dataset.ch;
      channels[ch].soloed = !channels[ch].soloed;
      e.target.classList.toggle('active', channels[ch].soloed);
      updateMixerRouting();
    });
  });

  document.getElementById('masterVolume').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    channels.master.volume = val;
    const masterFader = document.querySelector('.fader-vol[data-ch="master"]');
    if (masterFader) masterFader.value = val;
    const valLabel = document.getElementById('val-master');
    if (valLabel) valLabel.textContent = `${Math.round(val * 100)}%`;
    document.getElementById('volumeValue').textContent = `${Math.round(val * 100)}%`;
    updateMixerRouting();
  });

  // ------------------------------------------------------------------------
  // 11b. METRONOME ENGINE (Web Audio Lookahead Scheduler)
  // ------------------------------------------------------------------------
  let isMetroRunning = false;
  let metroBpm = 120;
  let metroTimeSig = 4;
  let metroCurrentBeat = 0;
  let metroNextNoteTime = 0;
  let metroTimerId = null;
  let metroSoundMode = 'wood';
  let metroVolume = 0.8;

  function scheduleMetroBeat(beatNumber, time) {
    if (!audioCtx) initAudioEngine();

    const isFirstBeat = (beatNumber === 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (metroSoundMode === 'wood') {
      osc.type = 'triangle';
      const freq = isFirstBeat ? 1200 : 800;
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + 0.03);

      gain.gain.setValueAtTime(metroVolume * (isFirstBeat ? 1.0 : 0.7), time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    } else if (metroSoundMode === 'bell') {
      osc.type = 'sine';
      const freq = isFirstBeat ? 1760 : 880;
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(metroVolume * (isFirstBeat ? 0.9 : 0.6), time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    } else {
      osc.type = 'square';
      const freq = isFirstBeat ? 2400 : 1600;
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(metroVolume * (isFirstBeat ? 0.8 : 0.5), time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    }

    osc.connect(gain);
    if (channels.master && channels.master.gain) {
      gain.connect(channels.master.gain);
    } else {
      gain.connect(audioCtx.destination);
    }

    osc.start(time);
    osc.stop(time + 0.15);

    const timeUntilBeatMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
    setTimeout(() => {
      if (!isMetroRunning) return;
      flashMetroLed(isFirstBeat);
    }, timeUntilBeatMs);
  }

  function nextMetroBeat() {
    const secondsPerBeat = 60.0 / metroBpm;
    metroNextNoteTime += secondsPerBeat;
    metroCurrentBeat = (metroCurrentBeat + 1) % metroTimeSig;
  }

  function metroScheduler() {
    while (metroNextNoteTime < audioCtx.currentTime + 0.1) {
      scheduleMetroBeat(metroCurrentBeat, metroNextNoteTime);
      nextMetroBeat();
    }
  }

  function startMetronome() {
    ensureAudioContext();
    isMetroRunning = true;
    metroCurrentBeat = 0;
    metroNextNoteTime = audioCtx.currentTime + 0.05;
    metroScheduler();
    metroTimerId = setInterval(metroScheduler, 25);

    const btn = document.getElementById('metroToggleBtn');
    if (btn) {
      btn.classList.add('active');
      const labelText = translations[currentLang]?.btnMetro || 'Métronome';
      btn.innerHTML = `<i class="fa-solid fa-bell text-xylo"></i> <span data-i18n="btnMetro">${labelText}</span> <span class="metro-led active" id="metroLed"></span>`;
    }
  }

  function stopMetronome() {
    isMetroRunning = false;
    if (metroTimerId) {
      clearInterval(metroTimerId);
      metroTimerId = null;
    }

    const btn = document.getElementById('metroToggleBtn');
    if (btn) {
      btn.classList.remove('active');
      const labelText = translations[currentLang]?.btnMetro || 'Métronome';
      btn.innerHTML = `<i class="fa-solid fa-bell-slash"></i> <span data-i18n="btnMetro">${labelText}</span> <span class="metro-led" id="metroLed"></span>`;
    }
    const led = document.getElementById('metroLed');
    if (led) led.classList.remove('flash-accent', 'flash-normal');
  }

  // ------------------------------------------------------------------------
  // BILINGUAL TRANSLATION SYSTEM (EN / FR) - DEFAULT: ENGLISH
  // ------------------------------------------------------------------------
  const translations = {
    en: {
      pageTitle: 'CloudBeats Studio — Virtual Music Creation Studio & Web DAW',
      pageMetaDesc: 'CloudBeats Studio is a professional, interactive Web Audio DAW featuring Grand Piano, virtual acoustic drums, real recorded xylophone, looper & mixing console.',
      btnMetro: 'Metronome',
      btnMic: 'Mic',
      btnRecord: 'Record',
      btnPlay: 'Listen',
      btnExport: 'Export MP3',
      focusAll: '⚡ All Active',
      focusPiano: '🎹 Piano Focus',
      focusXylo: '🔔 Xylophone Focus',
      metroTitle: 'METRONOME & TEMPO',
      lblTempo: 'Tempo',
      lblTimeSig: 'Time Sig',
      lblSound: 'Sound',
      lblVol: 'Vol',
      optWood: '🪵 Wood',
      optClick: '🎯 Click',
      optBell: '🔔 Bell',
      tabStudio: 'Studio View',
      tabPiano: 'Piano',
      tabDrums: 'Drums',
      tabXylo: 'Xylophone',
      tabMixer: 'Mixer',
      tabSeq: '16-Step Looper',
      titlePiano: 'Grand Piano',
      lblColor: 'Color:',
      optOrange: 'Fire Orange',
      optAmber: 'Golden Amber',
      optRed: 'Ruby Red',
      optCyan: 'Neon Cyan',
      optPurple: 'Purple Glow',
      btnSustain: 'Sustain',
      lblOctave: 'Octave:',
      titleDrums: 'Virtual Acoustic Drums',
      drumCrash: 'Crash Cymbal',
      drumHihat: 'Hi-Hat',
      drumHihatClosed: 'Closed Hi-Hat',
      drumHihatOpen: 'Open Hi-Hat',
      drumHihatPedal: 'Hi-Hat Pedal',
      drumTomHigh: 'High Tom',
      drumTomMid: 'Mid Tom',
      drumRide: 'Ride Cymbal',
      drumSnare: 'Snare Drum',
      drumKick: 'Bass Drum',
      drumTomLow: 'Low Tom',
      titleXylo: 'Real Recorded Xylophone',
      lblFinish: 'Finish:',
      optFire: 'Fire Orange',
      optRainbow: 'Rainbow',
      optPastel: 'Pastel',
      optMahogany: 'Mahogany Wood',
      optGold: 'Metallic Gold',
      titleMixer: 'Mixing Console',
      chPiano: 'PIANO',
      chDrums: 'DRUMS',
      chXylo: 'XYLOPHONE',
      chMic: 'MIC',
      chMaster: 'MASTER',
      titleSeq: 'Dual 16-Step Pattern Sequencer',
      seqPlay: 'Play Loop',
      seqPause: 'Pause',
      seqStop: 'Stop Loop',
      seqClear: 'Clear',
      seqTabDrums: 'Drum Sequencer',
      seqTabMelodic: 'Melodic Sequencer',
      seqTabDual: 'Dual View (Both)',
      seqBlockDrums: 'Acoustic Drum Kit Sequencer',
      seqBlockMelodic: 'Full Scale Melodic Sequencer (C4-C6)',
      presetRock: 'Rock & Piano',
      presetFunk: 'Groove & Xylo',
      presetBallad: 'Soft Ballad',
      tagline: 'Interactive Virtual Music Studio powered by Web Audio API.',
      copyright: '© 2026 <strong>CloudBeats Studio</strong>. All rights reserved.<br>Created by <strong>Émile Gagnon</strong> from <strong>GEEK FACTORY</strong>.',
      lblContact: 'Contact:',
      btnBmcFooter: 'Buy Émile a Coffee',
      btnBmcHeader: 'Buy Me a Coffee',
      btnGithubFooter: 'GitHub Source Code',
      creditsTitle: 'Credits & Tools Used',
      infraTitle: 'Engine & Infrastructure',
      lblAudioEngine: 'Audio Engine:',
      lblHosting: 'Hosting:',
      lblRepo: 'GitHub Repo:',
      lblVersion: 'Version:',
      lblFooterLove: 'Built for web music creation',
      lblFooterLicense: 'MIT Open Source License',
      trKick: 'Bass Drum',
      trSnare: 'Snare Drum',
      trHihat: 'Hi-Hat',
      trPianoC: 'Piano C4',
      trPianoE: 'Piano E4',
      trXyloG: 'Xylo G4',
      trXyloC: 'Xylo C5'
    },
    fr: {
      pageTitle: 'CloudBeats Studio — Studio de Création Musicale Virtuel & Web DAW',
      pageMetaDesc: 'CloudBeats Studio est un studio de création musicale interactif Web Audio DAW avec Grand Piano, batterie virtuelle, xylophone réel, looper & console de mixage.',
      btnMetro: 'Métronome',
      btnMic: 'Micro',
      btnRecord: 'Enregistrer',
      btnPlay: 'Écouter',
      btnExport: 'Export MP3',
      focusAll: '⚡ Tous Actifs',
      focusPiano: '🎹 Focus Piano',
      focusXylo: '🔔 Focus Xylophone',
      metroTitle: 'MÉTRONOME & TEMPO',
      lblTempo: 'Tempo',
      lblTimeSig: 'Mesure',
      lblSound: 'Son',
      lblVol: 'Vol',
      optWood: '🪵 Bois',
      optClick: '🎯 Clic',
      optBell: '🔔 Cloche',
      tabStudio: 'Vue Studio',
      tabPiano: 'Piano',
      tabDrums: 'Batterie',
      tabXylo: 'Xylophone',
      tabMixer: 'Mixage',
      tabSeq: 'Séquenceur',
      titlePiano: 'Grand Piano',
      lblColor: 'Couleur :',
      optOrange: 'Feu Orange',
      optAmber: 'Ambre Doré',
      optRed: 'Rouge Rubis',
      optCyan: 'Cyan Néon',
      optPurple: 'Violet Pulsant',
      btnSustain: 'Sustain',
      lblOctave: 'Octave :',
      titleDrums: 'Batterie',
      drumCrash: 'Cymbale Crash',
      drumHihat: 'Charley',
      drumHihatClosed: 'Charley Fermé',
      drumHihatOpen: 'Charley Ouvert',
      drumHihatPedal: 'Pédale Charley',
      drumTomHigh: 'Tom Haut',
      drumTomMid: 'Tom Moyen',
      drumRide: 'Cymbale Ride',
      drumSnare: 'Caisse Claire',
      drumKick: 'Grosse Caisse',
      drumTomLow: 'Tom Bas',
      titleXylo: 'Xylophone',
      lblFinish: 'Finition :',
      optFire: 'Feu Orange',
      optRainbow: 'Arc-en-ciel',
      optPastel: 'Pastel',
      optMahogany: 'Bois Acajou',
      optGold: 'Or Métallique',
      titleMixer: 'Console de Mixage',
      chPiano: 'PIANO',
      chDrums: 'BATTERIE',
      chXylo: 'XYLOPHONE',
      chMic: 'MICRO',
      chMaster: 'MASTER',
      titleSeq: 'Séquenceur 16 Étapes Double',
      seqPlay: 'Lancer la Boucle',
      seqPause: 'Pause',
      seqStop: 'Arrêter la Boucle',
      seqClear: 'Effacer',
      presetRock: 'Rock & Piano',
      presetFunk: 'Groove & Xylo',
      presetBallad: 'Ballade Douce',
      seqTabDrums: 'Séquenceur Batterie',
      seqTabMelodic: 'Séquenceur Mélodique',
      seqTabDual: 'Vue Double (Les 2)',
      seqBlockDrums: 'Séquenceur Batterie Acoustique',
      seqBlockMelodic: 'Séquenceur Mélodique Gamme Complète (Do4-Do6)',
      tagline: 'Studio de création musicale virtuel interactif Web Audio API.',
      copyright: '© 2026 <strong>CloudBeats Studio</strong>. Tous droits réservés.<br>Créé par <strong>Émile Gagnon</strong> de <strong>GEEK FACTORY</strong>.',
      lblContact: 'Contact :',
      btnBmcFooter: 'Offrir un café à Émile',
      btnBmcHeader: 'Offrir un café',
      btnGithubFooter: 'Code Source GitHub',
      creditsTitle: 'Crédits & Outils Utilisés',
      infraTitle: 'Moteur & Infrastructure',
      lblAudioEngine: 'Moteur Audio :',
      lblHosting: 'Hébergement :',
      lblRepo: 'Dépôt GitHub :',
      lblVersion: 'Version :',
      lblFooterLove: 'Conçu pour la création musicale sur le web',
      lblFooterLicense: 'Licence MIT Open Source',
      trKick: 'Grosse Caisse',
      trSnare: 'Caisse Claire',
      trHihat: 'Charley',
      trPianoC: 'Piano Do4',
      trPianoE: 'Piano Mi4',
      trXyloG: 'Xylo Sol4',
      trXyloC: 'Xylo Do5'
    }
  };

  let currentLang = localStorage.getItem('cloudbeats_lang') || 'en';

  function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('cloudbeats_lang', lang);

    const langText = document.getElementById('currentLangText');
    if (langText) langText.textContent = lang.toUpperCase();

    const t = translations[lang] || translations.en;

    // Update document title & meta SEO tags dynamically
    if (t.pageTitle) {
      document.title = t.pageTitle;
      document.querySelector('meta[name="title"]')?.setAttribute('content', t.pageTitle);
      document.getElementById('ogTitle')?.setAttribute('content', t.pageTitle);
      document.getElementById('twitterTitle')?.setAttribute('content', t.pageTitle);
    }
    if (t.pageMetaDesc) {
      document.getElementById('metaDescription')?.setAttribute('content', t.pageMetaDesc);
      document.getElementById('ogDesc')?.setAttribute('content', t.pageMetaDesc);
      document.getElementById('twitterDesc')?.setAttribute('content', t.pageMetaDesc);
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) {
        el.innerHTML = t[key];
      }
    });

    // Re-render looper matrix labels in active language
    if (typeof renderSequencerMatrix === 'function') {
      renderSequencerMatrix();
    }
  }

  document.getElementById('langToggleBtn')?.addEventListener('click', () => {
    const newLang = currentLang === 'en' ? 'fr' : 'en';
    applyLanguage(newLang);
  });

  // Metronome UI Listeners
  function flashMetroLed(isAccent) {
    const led = document.getElementById('metroLed');
    if (!led) return;
    led.classList.remove('flash-accent', 'flash-normal');
    void led.offsetWidth;
    led.classList.add(isAccent ? 'flash-accent' : 'flash-normal');
    setTimeout(() => {
      led.classList.remove('flash-accent', 'flash-normal');
    }, 100);
  }

  // Metronome UI Listeners
  document.getElementById('metroToggleBtn')?.addEventListener('click', () => {
    if (isMetroRunning) stopMetronome();
    else startMetronome();
  });

  document.getElementById('metroTimeSig')?.addEventListener('change', (e) => {
    metroTimeSig = parseInt(e.target.value) || 4;
    metroCurrentBeat = 0;
  });

  document.getElementById('metroSound')?.addEventListener('change', (e) => {
    metroSoundMode = e.target.value;
  });

  function updateTempo(newBpm) {
    const bpm = Math.max(40, Math.min(240, Math.round(newBpm)));
    metroBpm = bpm;

    const bpmInput = document.getElementById('tempoBpm');
    if (bpmInput && parseInt(bpmInput.value) !== bpm) bpmInput.value = bpm;

    const tempoSlider = document.getElementById('tempoSlider');
    if (tempoSlider && parseInt(tempoSlider.value) !== bpm) tempoSlider.value = bpm;

    const presetSelect = document.getElementById('tempoPresetSelect');
    if (presetSelect) {
      const matchOption = Array.from(presetSelect.options).find(opt => parseInt(opt.value) === bpm);
      presetSelect.value = matchOption ? matchOption.value : '';
    }
  }

  document.getElementById('tempoBpm')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val)) updateTempo(val);
  });

  document.getElementById('tempoSlider')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val)) updateTempo(val);
  });

  document.getElementById('tempoPresetSelect')?.addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val)) updateTempo(val);
  });

  // Tap Tempo Listener
  let tapTimes = [];
  document.getElementById('tapTempoBtn')?.addEventListener('click', () => {
    const now = performance.now();
    tapTimes.push(now);
    tapTimes = tapTimes.filter(t => now - t < 3000);

    if (tapTimes.length >= 2) {
      let intervals = [];
      for (let i = 1; i < tapTimes.length; i++) {
        intervals.push(tapTimes[i] - tapTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const computedBpm = Math.round(60000 / avgInterval);

      if (computedBpm >= 40 && computedBpm <= 240) {
        updateTempo(computedBpm);
      }
    }
  });

  document.getElementById('metroVolSlider')?.addEventListener('input', (e) => {
    metroVolume = parseFloat(e.target.value);
  });

  // Metronome Bar Visibility Toggle
  const toggleMetroBarBtn = document.getElementById('toggleMetroBarBtn');
  const metronomeToolbar = document.getElementById('metronomeToolbar');

  toggleMetroBarBtn?.addEventListener('click', () => {
    if (metronomeToolbar) {
      const isHidden = metronomeToolbar.classList.contains('hidden');
      if (isHidden) {
        metronomeToolbar.classList.remove('hidden');
        toggleMetroBarBtn.classList.add('active');
      } else {
        metronomeToolbar.classList.add('hidden');
        toggleMetroBarBtn.classList.remove('active');
      }
    }
  });

  // ------------------------------------------------------------------------
  // 12. DUAL SEQUENCEURS 16-STEPS (FULL DRUMS + FULL SCALE MELODIC)
  // ------------------------------------------------------------------------
  const seqDrumTracks = [
    { id: 'kick', key: 'trKick', defaultEn: 'Bass Drum', defaultFr: 'Grosse Caisse', type: 'drum', sound: 'kick', icon: 'fa-drum' },
    { id: 'snare', key: 'trSnare', defaultEn: 'Snare Drum', defaultFr: 'Caisse Claire', type: 'drum', sound: 'snare', icon: 'fa-box' },
    { id: 'hihat', key: 'drumHihatClosed', defaultEn: 'Closed Hi-Hat', defaultFr: 'Charley Fermé', type: 'drum', sound: 'hihat', icon: 'fa-circle-dot' },
    { id: 'openhat', key: 'drumHihatOpen', defaultEn: 'Open Hi-Hat', defaultFr: 'Charley Ouvert', type: 'drum', sound: 'openhat', icon: 'fa-compact-disc' },
    { id: 'tom1', key: 'drumTomHigh', defaultEn: 'High Tom', defaultFr: 'Tom Haut', type: 'drum', sound: 'tom1', icon: 'fa-layer-group' },
    { id: 'tom2', key: 'drumTomMid', defaultEn: 'Mid Tom', defaultFr: 'Tom Moyen', type: 'drum', sound: 'tom2', icon: 'fa-cubes' },
    { id: 'tomlow', key: 'drumTomLow', defaultEn: 'Low Tom', defaultFr: 'Tom Bas', type: 'drum', sound: 'clap', icon: 'fa-drum' },
    { id: 'crash', key: 'drumCrash', defaultEn: 'Crash Cymbal', defaultFr: 'Cymbale Crash', type: 'drum', sound: 'crash', icon: 'fa-star' },
    { id: 'ride', key: 'drumRide', defaultEn: 'Ride Cymbal', defaultFr: 'Cymbale Ride', type: 'drum', sound: 'ride', icon: 'fa-record-vinyl' },
    { id: 'clap', key: 'trClap', defaultEn: 'Clap', defaultFr: 'Clap', type: 'drum', sound: 'clap', icon: 'fa-hands-clapping' }
  ];

  const seqMelodicTracks = [
    { id: 'mel_c4', note: 'C4', label: 'Do 4 (C4)', type: 'piano', sound: 'C4', icon: 'fa-keyboard' },
    { id: 'mel_d4', note: 'D4', label: 'Ré 4 (D4)', type: 'piano', sound: 'D4', icon: 'fa-keyboard' },
    { id: 'mel_e4', note: 'E4', label: 'Mi 4 (E4)', type: 'piano', sound: 'E4', icon: 'fa-keyboard' },
    { id: 'mel_f4', note: 'F4', label: 'Fa 4 (F4)', type: 'piano', sound: 'F4', icon: 'fa-keyboard' },
    { id: 'mel_g4', note: 'G4', label: 'Sol 4 (G4)', type: 'piano', sound: 'G4', icon: 'fa-keyboard' },
    { id: 'mel_a4', note: 'A4', label: 'La 4 (A4)', type: 'piano', sound: 'A4', icon: 'fa-keyboard' },
    { id: 'mel_b4', note: 'B4', label: 'Si 4 (B4)', type: 'piano', sound: 'B4', icon: 'fa-keyboard' },
    { id: 'mel_c5', note: 'C5', label: 'Do 5 (C5)', type: 'xylo', sound: 'C5', icon: 'fa-bars-staggered' },
    { id: 'mel_d5', note: 'D5', label: 'Ré 5 (D5)', type: 'xylo', sound: 'D5', icon: 'fa-bars-staggered' },
    { id: 'mel_e5', note: 'E5', label: 'Mi 5 (E5)', type: 'xylo', sound: 'E5', icon: 'fa-bars-staggered' },
    { id: 'mel_f5', note: 'F5', label: 'Fa 5 (F5)', type: 'xylo', sound: 'F5', icon: 'fa-bars-staggered' },
    { id: 'mel_g5', note: 'G5', label: 'Sol 5 (G5)', type: 'xylo', sound: 'G5', icon: 'fa-bars-staggered' },
    { id: 'mel_a5', note: 'A5', label: 'La 5 (A5)', type: 'xylo', sound: 'A5', icon: 'fa-bars-staggered' },
    { id: 'mel_b5', note: 'B5', label: 'Si 5 (B5)', type: 'xylo', sound: 'B5', icon: 'fa-bars-staggered' },
    { id: 'mel_c6', note: 'C6', label: 'Do 6 (C6)', type: 'xylo', sound: 'C6', icon: 'fa-bars-staggered' }
  ];

  let seqDrumState = seqDrumTracks.map(() => Array(16).fill(false));
  let seqMelodicState = seqMelodicTracks.map(() => Array(16).fill(false));
  let isSeqPlaying = false;
  let currentStep = 0;
  let seqTimer = null;

  function renderSingleMatrix(tracks, state, containerId, stateKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    tracks.forEach((track, trackIdx) => {
      const row = document.createElement('div');
      row.className = 'seq-row';

      const trackName = track.label || (translations[currentLang] && translations[currentLang][track.key]) || (currentLang === 'fr' ? track.defaultFr : track.defaultEn);

      const info = document.createElement('div');
      info.className = 'seq-track-info';
      info.innerHTML = `<i class="fa-solid ${track.icon}"></i> ${trackName}`;
      row.appendChild(info);

      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'seq-steps';

      for (let stepIdx = 0; stepIdx < 16; stepIdx++) {
        const cell = document.createElement('div');
        cell.className = `step-cell ${state[trackIdx][stepIdx] ? 'active' : ''}`;
        cell.dataset.track = trackIdx;
        cell.dataset.step = stepIdx;
        cell.dataset.stateKey = stateKey;

        cell.addEventListener('click', () => {
          state[trackIdx][stepIdx] = !state[trackIdx][stepIdx];
          cell.classList.toggle('active', state[trackIdx][stepIdx]);
        });

        stepsContainer.appendChild(cell);
      }

      row.appendChild(stepsContainer);
      container.appendChild(row);
    });
  }

  function renderSequencerMatrix() {
    renderSingleMatrix(seqDrumTracks, seqDrumState, 'sequencerMatrixDrums', 'drums');
    renderSingleMatrix(seqMelodicTracks, seqMelodicState, 'sequencerMatrixMelodic', 'melodic');
  }

  function startSequencer() {
    if (isSeqPlaying) return;
    ensureAudioContext();
    isSeqPlaying = true;
    currentStep = 0;
    const playBtn = document.getElementById('seqPlayBtn');
    if (playBtn) {
      playBtn.innerHTML = `<i class="fa-solid fa-pause"></i> ${translations[currentLang]?.seqPause || 'Pause'}`;
      playBtn.classList.replace('btn-primary', 'btn-secondary');
    }

    runSeqStep();
  }

  function stopSequencer() {
    isSeqPlaying = false;
    clearTimeout(seqTimer);
    const playBtn = document.getElementById('seqPlayBtn');
    if (playBtn) {
      playBtn.innerHTML = `<i class="fa-solid fa-play"></i> <span data-i18n="seqPlay">${translations[currentLang]?.seqPlay || 'Play Loop'}</span>`;
      playBtn.classList.replace('btn-secondary', 'btn-primary');
    }
    document.querySelectorAll('.step-cell').forEach(c => c.classList.remove('playing-step'));
  }

  function runSeqStep() {
    if (!isSeqPlaying) return;

    const bpm = parseInt(document.getElementById('tempoBpm').value) || 120;
    const stepTimeMs = (60 / bpm / 4) * 1000;

    document.querySelectorAll('.step-cell').forEach(c => c.classList.remove('playing-step'));
    document.querySelectorAll(`.step-cell[data-step="${currentStep}"]`).forEach(c => c.classList.add('playing-step'));

    // 1. Trigger Drum Sequencer Notes
    seqDrumTracks.forEach((track, trackIdx) => {
      if (seqDrumState[trackIdx][currentStep]) {
        triggerDrumElement(track.sound);
      }
    });

    // 2. Trigger Melodic Sequencer Notes
    seqMelodicTracks.forEach((track, trackIdx) => {
      if (seqMelodicState[trackIdx][currentStep]) {
        if (track.type === 'piano') {
          triggerPianoKey(track.sound);
        } else if (track.type === 'xylo') {
          triggerXyloBar(track.sound);
        }
      }
    });

    currentStep = (currentStep + 1) % 16;
    seqTimer = setTimeout(runSeqStep, stepTimeMs);
  }

  document.getElementById('seqPlayBtn')?.addEventListener('click', () => {
    if (isSeqPlaying) stopSequencer();
    else startSequencer();
  });

  document.getElementById('seqClearBtn')?.addEventListener('click', () => {
    seqDrumState = seqDrumTracks.map(() => Array(16).fill(false));
    seqMelodicState = seqMelodicTracks.map(() => Array(16).fill(false));
    renderSequencerMatrix();
  });

  // Dual Sequencer Sub-Tabs Listener
  const seqSubTabs = document.querySelectorAll('.seq-sub-tab');
  const seqBlockDrums = document.getElementById('seqBlockDrums');
  const seqBlockMelodic = document.getElementById('seqBlockMelodic');

  seqSubTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.seqTab;
      seqSubTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (mode === 'drums') {
        seqBlockDrums?.classList.remove('hidden-seq-block');
        seqBlockMelodic?.classList.add('hidden-seq-block');
      } else if (mode === 'melodic') {
        seqBlockDrums?.classList.add('hidden-seq-block');
        seqBlockMelodic?.classList.remove('hidden-seq-block');
      } else if (mode === 'dual') {
        seqBlockDrums?.classList.remove('hidden-seq-block');
        seqBlockMelodic?.classList.remove('hidden-seq-block');
      }
    });
  });

  document.getElementById('seqPresetSelect')?.addEventListener('change', (e) => {
    const val = e.target.value;
    seqDrumState = seqDrumTracks.map(() => Array(16).fill(false));
    seqMelodicState = seqMelodicTracks.map(() => Array(16).fill(false));

    if (val === 'rock') {
      // Rock Drums
      seqDrumState[0][0] = seqDrumState[0][8] = seqDrumState[0][10] = true; // Kick
      seqDrumState[1][4] = seqDrumState[1][12] = true; // Snare
      seqDrumState[2][0] = seqDrumState[2][2] = seqDrumState[2][4] = seqDrumState[2][6] = seqDrumState[2][8] = seqDrumState[2][10] = seqDrumState[2][12] = seqDrumState[2][14] = true; // Hihat
      seqDrumState[7][0] = true; // Crash
      // Rock Piano / Melodic
      seqMelodicState[0][0] = seqMelodicState[2][0] = seqMelodicState[4][0] = true; // C4 E4 G4
      seqMelodicState[0][4] = seqMelodicState[2][4] = seqMelodicState[4][4] = true;
      seqMelodicState[5][8] = seqMelodicState[0][8] = seqMelodicState[2][8] = true; // A4 C4 E4
      seqMelodicState[3][12] = seqMelodicState[5][12] = seqMelodicState[0][12] = true; // F4 A4 C4
    } else if (val === 'funk') {
      // Funk Drums
      seqDrumState[0][0] = seqDrumState[0][6] = seqDrumState[0][10] = true;
      seqDrumState[1][4] = seqDrumState[1][12] = seqDrumState[1][14] = true;
      seqDrumState[3][2] = seqDrumState[3][10] = true; // Openhat
      seqDrumState[9][4] = seqDrumState[9][12] = true; // Clap
      // Xylo Funk Arpeggio
      seqMelodicState[7][0] = seqMelodicState[9][2] = seqMelodicState[11][4] = seqMelodicState[14][6] = true; // C5 E5 G5 C6
      seqMelodicState[11][8] = seqMelodicState[9][10] = seqMelodicState[7][12] = seqMelodicState[4][14] = true;
    } else if (val === 'ballad') {
      // Soft Ballad
      seqDrumState[0][0] = seqDrumState[0][8] = true;
      seqDrumState[1][4] = seqDrumState[1][12] = true;
      seqDrumState[2][0] = seqDrumState[2][4] = seqDrumState[2][8] = seqDrumState[2][12] = true;
      // Soft Melodic Harmony
      seqMelodicState[0][0] = seqMelodicState[2][2] = seqMelodicState[4][4] = seqMelodicState[7][6] = true;
      seqMelodicState[9][8] = seqMelodicState[11][10] = seqMelodicState[14][12] = true;
    }

    renderSequencerMatrix();
  });

  // ------------------------------------------------------------------------
  // 13. SAMPLE MANAGER SECTION
  // ------------------------------------------------------------------------

  // ------------------------------------------------------------------------
  // 14. SESSION RECORDER (Instruments + Microphone)
  // ------------------------------------------------------------------------
  const recordBtn = document.getElementById('recordBtn');
  const playRecordBtn = document.getElementById('playRecordBtn');
  const downloadRecordBtn = document.getElementById('downloadRecordBtn');
  const micToggleBtn = document.getElementById('micToggleBtn');
  let recordedAudioUrl = null;
  let micStream = null;
  let micSourceNode = null;
  let micGainNode = null;
  let micEnabled = false;

  // Microphone Toggle
  micToggleBtn.addEventListener('click', async () => {
    if (!micEnabled) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: true,
            autoGainControl: false
          },
          video: false
        });
        ensureAudioContext();
        micSourceNode = audioCtx.createMediaStreamSource(micStream);

        // Route mic directly into dedicated mic channel gain node
        micSourceNode.connect(channels.mic.gain);

        // Simple Peak Monitor for Microphone VU meter
        const micScriptProcessor = audioCtx.createScriptProcessor ? audioCtx.createScriptProcessor(1024, 1, 1) : null;
        if (micScriptProcessor) {
          micSourceNode.connect(micScriptProcessor);
          micScriptProcessor.connect(audioCtx.destination);
          micScriptProcessor.onaudioprocess = (e) => {
            if (!micEnabled) return;
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);
            let max = 0;
            for (let i = 0; i < input.length; i++) {
              const abs = Math.abs(input[i]);
              if (abs > max) max = abs;
              output[i] = 0; // Mute live speaker feedback
            }
            channels.mic.peak = Math.max(channels.mic.peak, max * 1.8);
          };
        }

        micEnabled = true;
        micToggleBtn.classList.add('active');
        micToggleBtn.innerHTML = `<i class="fa-solid fa-microphone text-piano"></i> <span data-i18n="btnMic">Micro (On)</span>`;
      } catch (err) {
        console.error('Microphone access error:', err);
        alert('Impossible d\'accéder au microphone. Vérifiez les permissions de votre navigateur.');
      }
    } else {
      if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
      }
      micEnabled = false;
      micToggleBtn.classList.remove('active');
      micToggleBtn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i> <span data-i18n="btnMic">Micro</span>`;
    }
  });

  // MP3 Converter using lamejs
  async function convertAudioBlobToMp3(webmBlob) {
    if (!audioCtx) initAudioEngine();

    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const kbps = 192;

    if (typeof lamejs !== 'undefined') {
      const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
      const mp3Data = [];
      const sampleLength = audioBuffer.length;

      const left = audioBuffer.getChannelData(0);
      const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;

      const leftChunk = new Int16Array(sampleLength);
      const rightChunk = new Int16Array(sampleLength);

      for (let i = 0; i < sampleLength; i++) {
        let sL = Math.max(-1, Math.min(1, left[i]));
        let sR = Math.max(-1, Math.min(1, right[i]));
        leftChunk[i] = sL < 0 ? sL * 32768 : sL * 32767;
        rightChunk[i] = sR < 0 ? sR * 32768 : sR * 32767;
      }

      const chunkSize = 1152;
      for (let i = 0; i < sampleLength; i += chunkSize) {
        const leftSub = leftChunk.subarray(i, i + chunkSize);
        const rightSub = rightChunk.subarray(i, i + chunkSize);
        let mp3buf = numChannels === 2
          ? mp3encoder.encodeBuffer(leftSub, rightSub)
          : mp3encoder.encodeBuffer(leftSub);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
      }

      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) mp3Data.push(mp3buf);

      return new Blob(mp3Data, { type: 'audio/mp3' });
    }

    return webmBlob;
  }

  recordBtn.addEventListener('click', () => {
    ensureAudioContext();

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      recordBtn.classList.remove('recording');
    } else {
      recordedChunks = [];
      // destNode captures all audio through master (instruments + mic if enabled)
      const stream = destNode.stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        downloadRecordBtn.classList.add('hidden');
        recordBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Traitement MP3...`;
        recordBtn.disabled = true;

        const webmBlob = new Blob(recordedChunks, { type: mimeType });
        let mp3Blob;
        try {
          mp3Blob = await convertAudioBlobToMp3(webmBlob);
        } catch (err) {
          console.warn('MP3 conversion fallback', err);
          mp3Blob = webmBlob;
        }

        recordedAudioUrl = URL.createObjectURL(mp3Blob);
        playRecordBtn.disabled = false;
        downloadRecordBtn.href = recordedAudioUrl;
        downloadRecordBtn.download = 'cloudbeats-session.mp3';
        downloadRecordBtn.innerHTML = `<i class="fa-solid fa-download"></i> Export MP3`;
        downloadRecordBtn.classList.remove('hidden');

        recordBtn.disabled = false;
        recordBtn.innerHTML = `<i class="fa-solid fa-circle"></i> Enregistrer`;
      };

      mediaRecorder.start(100); // collect chunks every 100ms
      recordBtn.classList.add('recording');
      recordBtn.innerHTML = `<i class="fa-solid fa-square"></i> Arrêter`;
    }
  });

  playRecordBtn.addEventListener('click', () => {
    if (recordedAudioUrl) {
      const audio = new Audio(recordedAudioUrl);
      audio.play();
    }
  });

  // ------------------------------------------------------------------------
  // 15. KEYBOARD SHORTCUTS & INSTRUMENT FOCUS ENGINE
  // ------------------------------------------------------------------------
  let activeKeyboardFocus = 'all';

  const keyboardFocusSelect = document.getElementById('keyboardFocusSelect');
  if (keyboardFocusSelect) {
    keyboardFocusSelect.addEventListener('change', (e) => {
      activeKeyboardFocus = e.target.value;
      e.target.blur();
    });
  }

  const drumKeyMap = {
    '1': 'kick',
    '2': 'snare',
    '3': 'hihat',
    '4': 'openhat',
    '5': 'tom1',
    '6': 'tom2',
    '7': 'crash',
    '8': 'ride',
    '9': 'clap'
  };

  document.addEventListener('keydown', (e) => {
    // Only ignore keys if user is typing in a text or number input box
    if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) return;

    ensureAudioContext();

    const key = e.key.toLowerCase();

    // 1. Drums Shortcuts (Always active on 1-9)
    if (drumKeyMap[key]) {
      triggerDrumElement(drumKeyMap[key]);
      return;
    }

    // 2. Piano Focus or All Active Mode
    if (activeKeyboardFocus === 'piano' || activeKeyboardFocus === 'all') {
      const lowerMatch = pianoLowerKeys.find(n => n.key === key);
      if (lowerMatch) {
        triggerPianoKey(`${lowerMatch.note}${currentOctave}`);
        return;
      }
      const upperMatch = pianoUpperKeys.find(n => n.key === key);
      if (upperMatch) {
        triggerPianoKey(`${upperMatch.note}${currentOctave + 1}`);
        return;
      }
    }

    // 3. Xylophone Focus Mode or All Active Mode
    if (activeKeyboardFocus === 'xylo' || activeKeyboardFocus === 'all') {
      const xyloMatch = xyloBarsConfig.find(x => x.key === key);
      if (xyloMatch) {
        triggerXyloBar(xyloMatch.note);
        return;
      }
    }
  });

  // Navigation Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.instrument-section');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      sections.forEach(sec => {
        if (target === 'all') {
          sec.style.display = 'flex';
        } else {
          sec.style.display = sec.id === `section-${target}` ? 'flex' : 'none';
        }
      });
    });
  });

  // Init UI Components
  renderPianoKeyboard();
  renderXylophone();
  renderSequencerMatrix();
  startVisualizer();
  applyLanguage(currentLang);
  preloadLocalFolderSamples();

  document.body.addEventListener('touchstart', ensureAudioContext, { once: true });
  document.body.addEventListener('click', ensureAudioContext, { once: true });
});
