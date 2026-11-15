/**
 * Seamless avatar loop.
 *
 * WHY: the scene builder feeds the avatar with `-stream_loop -1`, which is a
 * HARD CUT every time the clip restarts. With a short driving template (the
 * 3.1s "neutral breathing" one) that cut lands every ~3 seconds and the avatar
 * visibly FLICKERS. The user saw exactly that.
 *
 * Fix: build a ping-pong loop (clip + reversed clip). The motion flows
 * forward, then back, and the loop point is continuous — no cut, no flicker.
 * For a breathing/neutral avatar the reversal is completely natural.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** Duration of a media file in seconds (0 when unknown). */
export async function probeDuration(ffprobe, file) {
  if (!ffprobe || !file || !fs.existsSync(file)) return 0;
  return new Promise((resolve) => {
    const child = spawn(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', () => {});
    child.on('error', () => resolve(0));
    child.on('close', () => {
      const n = Number(String(out).trim().split(/[\r\n,]/)[0]);
      resolve(Number.isFinite(n) && n > 0 ? n : 0);
    });
  });
}

/**
 * Ensure the avatar clip is long enough for a scene AND loops seamlessly.
 * Returns the path of the file to use (the loop file, or the original).
 */
export async function ensureSeamlessLoop(ffmpeg, ffprobe, clipFile, targetSec = 18) {
  const out = clipFile.replace(/\.mp4$/, '_loop.mp4');
  if (!fs.existsSync(clipFile)) return clipFile;
  if (fs.existsSync(out)) return out;

  const dur = await probeDuration(ffprobe, clipFile);
  if (!dur || dur >= targetSec) return clipFile;   // long enough, no loop needed

  const { spawn: spawn2 } = await import('node:child_process');
  const rc = await new Promise((resolve) => {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', clipFile,
      '-filter_complex',
      '[0:v]split=2[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[out]',
      '-map', '[out]',
      '-an',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      out,
    ];
    const child = spawn2(ffmpeg, args, { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', () => resolve({ code: -1, err }));
    child.on('close', (code) => resolve({ code, err }));
  });

  if (rc.code !== 0 || !fs.existsSync(out)) {
    // Fall back to the original clip: a short loop is better than no avatar.
    try { if (fs.existsSync(out)) fs.unlinkSync(out); } catch { /* ignore */ }
    return clipFile;
  }
  return out;
}
