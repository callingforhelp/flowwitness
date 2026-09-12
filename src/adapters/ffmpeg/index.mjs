import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeEdit, resolveTiming, isArtifactRef } from '../../modules/video/edit.mjs';

// Executables and font are trusted composition settings, never request fields.
export function createFFmpegRenderer({ artifacts, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', fontFile,
  tempRoot = tmpdir(), maxBytes = 128 * 1024 * 1024, timeoutMs = 120000 } = {}) {
  function run(binary, args, cwd, signal) {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const child = spawn(binary, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; let failure;
      const abort = () => { failure = signal.reason; child.kill('SIGKILL'); };
      signal.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', chunk => {
        if (output.length + chunk.length > 1024 * 1024) { failure = new Error('Probe output limit exceeded'); child.kill('SIGKILL'); }
        else output += chunk;
      });
      child.stderr.resume(); // Do not expose media metadata or local filenames in errors.
      child.once('error', error => { signal.removeEventListener('abort', abort); reject(error); });
      child.once('close', code => {
        signal.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else if (code !== 0) reject(Object.assign(new Error('Media processing failed'), { code: 'render_failed' }));
        else resolve(output);
      });
      if (signal.aborted) abort();
    });
  }
  async function workspace(options, fn) {
    const signal = AbortSignal.any([AbortSignal.timeout(Math.min(options.timeoutMs ?? timeoutMs, timeoutMs)), ...(options.signal ? [options.signal] : [])]);
    signal.throwIfAborted();
    const dir = await mkdtemp(join(tempRoot, 'flowwitness-video-'));
    try { return await fn(dir, signal); }
    finally { await rm(dir, { recursive: true, force: true }); }
  }
  async function materialize(scope, id, dir, name, signal) {
    if (!isArtifactRef(id)) throw new Error('Expected an opaque artifact ID');
    const meta = await artifacts.get(scope, id);
    if (!meta || meta.revokedAt || (meta.expiresAt && !(Date.parse(meta.expiresAt) > Date.now())) || meta.size > maxBytes) throw new Error('Artifact unavailable or too large');
    signal.throwIfAborted();
    const source = await artifacts.read(scope, id);
    const chunks = []; let size = 0;
    const stream = Buffer.isBuffer(source) || source instanceof Uint8Array ? [source] : source;
    const abort = () => source.destroy?.(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    try {
      for await (const chunk of stream) {
        signal.throwIfAborted(); size += chunk.length;
        if (size > maxBytes) throw new Error('Artifact exceeds byte limit');
        chunks.push(Buffer.from(chunk));
      }
      signal.throwIfAborted();
      await writeFile(join(dir, name), Buffer.concat(chunks), { mode: 0o600 });
    } finally { signal.removeEventListener('abort', abort); }
    return name;
  }
  const probeFile = async (dir, name, signal) => {
    const data = JSON.parse(await run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-show_format', '-show_streams', '-of', 'json', name], dir, signal));
    const video = data.streams?.find(s => s.codec_type === 'video');
    const durationMs = Math.round(Number(data.format?.duration) * 1000);
    if (!video || !Number.isFinite(durationMs) || durationMs <= 0 || video.width > 3840 || video.height > 2160) throw new Error('Unsupported source dimensions or duration');
    return { durationMs, width: video.width, height: video.height, hasAudio: data.streams.some(s => s.codec_type === 'audio') };
  };
  async function probe(scope, { id }, options = {}) {
    return workspace(options, async (dir, signal) => probeFile(dir, await materialize(scope, id, dir, 'source', signal), signal));
  }
  async function render(plan, options = {}) {
    return workspace(options, async (dir, signal) => {
      const { scope } = options;
      const source = await materialize(scope, plan.source?.artifactId, dir, 'source', signal);
      const info = await probeFile(dir, source, signal);
      const edit = normalizeEdit({ trim: plan.trim, segments: plan.segments, captions: plan.captions,
        colors: plan.colors, highlights: plan.highlights, logoArtifactId: plan.logo?.artifactId, narrationArtifactId: plan.narration?.artifactId });
      const timing = resolveTiming(edit, info.durationMs);
      const args = ['-nostdin', '-v', 'error', '-y', '-threads', '1', '-filter_complex_threads', '1', '-protocol_whitelist', 'file', '-i', source];
      let logoIndex; let narrationIndex; let index = 1;
      if (edit.logoArtifactId) {
        logoIndex = index++;
        args.push('-protocol_whitelist', 'file', '-i', await materialize(scope, edit.logoArtifactId, dir, 'logo', signal));
      }
      if (edit.narrationArtifactId) {
        narrationIndex = index++;
        args.push('-protocol_whitelist', 'file', '-i', await materialize(scope, edit.narrationArtifactId, dir, 'narration', signal));
      }
      if (fontFile) await writeFile(join(dir, 'font.ttf'), await readFile(fontFile), { mode: 0o600 });
      const graph = [];
      timing.segments.forEach((s, i) => {
        graph.push(`[0:v]trim=start=${s.startMs / 1000}:end=${s.endMs / 1000},setpts=PTS-STARTPTS,setsar=1[v${i}]`);
        if (info.hasAudio) graph.push(`[0:a]atrim=start=${s.startMs / 1000}:end=${s.endMs / 1000},asetpts=PTS-STARTPTS[a${i}]`);
      });
      const cuts = timing.segments.map((_, i) => `[v${i}]${info.hasAudio ? `[a${i}]` : ''}`).join('');
      graph.push(`${cuts}concat=n=${timing.segments.length}:v=1:a=${info.hasAudio ? 1 : 0}[base]${info.hasAudio ? '[audio]' : ''}`);
      let video = 'base'; let n = 0;
      const filter = expression => { const next = `fx${n++}`; graph.push(`[${video}]${expression}[${next}]`); video = next; };
      for (const h of edit.highlights) filter(`drawbox=x=iw*${h.x}:y=ih*${h.y}:w=iw*${h.width}:h=ih*${h.height}:color=${edit.colors.primary}:t=3:enable='between(t,${h.startMs / 1000},${h.endMs / 1000})'`);
      for (const [i, c] of edit.captions.entries()) {
        await writeFile(join(dir, `caption${i}.txt`), c.text, { mode: 0o600 });
        filter(`drawtext=${fontFile ? 'fontfile=font.ttf:' : ''}textfile=caption${i}.txt:expansion=none:fontcolor=${edit.colors.text}:fontsize=24:box=1:boxcolor=${edit.colors.background}:boxborderw=8:x=(w-text_w)/2:y=h-text_h-24:enable='between(t,${c.startMs / 1000},${c.endMs / 1000})'`);
      }
      if (logoIndex !== undefined) {
        graph.push(`[${logoIndex}:v]scale=64:64:force_original_aspect_ratio=decrease[logo]`);
        graph.push(`[${video}][logo]overlay=x=10:y=10:eof_action=repeat[branded]`); video = 'branded';
      }
      let audio = info.hasAudio ? 'audio' : null;
      if (narrationIndex !== undefined) {
        graph.push(`[${narrationIndex}:a]apad,atrim=duration=${timing.outputDurationMs / 1000},asetpts=PTS-STARTPTS[voice]`);
        if (audio) { graph.push('[audio][voice]amix=inputs=2:duration=longest[mixed]'); audio = 'mixed'; }
        else audio = 'voice';
      }
      filter(`fps=30,tpad=stop_mode=clone:stop_duration=1,trim=duration=${timing.outputDurationMs / 1000},pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p`);
      await writeFile(join(dir, 'filters.txt'), graph.join(';'), { mode: 0o600 });
      args.push('-filter_complex_script', 'filters.txt', '-map', `[${video}]`);
      if (audio) args.push('-map', `[${audio}]`, '-c:a', 'aac');
      args.push('-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-t', String(timing.outputDurationMs / 1000), '-fs', String(maxBytes), '-movflags', '+faststart', 'output.mp4');
      await run(ffmpeg, args, dir, signal);
      signal.throwIfAborted();
      const bytes = await readFile(join(dir, 'output.mp4'));
      if (bytes.length >= maxBytes) throw new Error('Output exceeds byte limit');
      const output = await probeFile(dir, 'output.mp4', signal);
      if (Math.abs(output.durationMs - timing.outputDurationMs) > 250) throw new Error('Output duration mismatch');
      return { bytes, mediaType: 'video/mp4', durationMs: output.durationMs };
    });
  }
  return { probe, render };
}

export const createRenderer = createFFmpegRenderer;
